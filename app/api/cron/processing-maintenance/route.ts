/**
 * GET /api/cron/processing-maintenance
 *
 * Zbiorczy cron job dla maintenance processing service state w HTG2:
 *
 * 1. Nonce cleanup — DELETE processing_nonce_store > 10 min (anti-replay TTL)
 * 2. Idempotency cleanup — DELETE idempotency_keys > 7 days
 * 3. Stuck job detector — processing_jobs z status='running' bez heartbeat > 5 min
 *    → reconcile (szuka sierocych advisories i domyka) lub failed
 * 4. Pending timeout — processing_jobs z status='pending' > 10 min bez check-in
 *    → failed z error_code='pending_timeout'
 * 5. Orphan draft GC — processing_advisories z status='draft' bez linku > 7 dni
 *    → status='expired' z error_code='orphan_draft_gc'
 * 6. Wall-clock cap — processing_jobs z status='running' > 45 min od created_at
 *    → failed z error_code='wall_clock_exceeded'
 * 7. Version reservation cleanup — version_reservations z version=-1 > 1h
 *    (defensywne — w happy path nie powinny istnieć)
 *
 * Schedule: co 5 minut (vercel.json). Każdy krok jest idempotent i bezpieczny
 * do wielokrotnego wykonania (races między instancjami Vercel OK — UPDATE
 * z WHERE na status zapobiega podwójnym tranzycjom).
 *
 * Auth: CRON_SECRET, fail-closed.
 *
 * Patrz: docs/processing-service-plan.md §2.2 (recovery), §13 (Phase 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  // Auth: fail-closed
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();
  const results: Record<string, number | string> = {};

  // ── 1. Nonce cleanup (TTL 10 min) ──
  try {
    const { data: nonceCount } = await db.rpc('cleanup_processing_nonces');
    results.nonces_cleaned = (nonceCount as number) ?? 0;
  } catch (err) {
    results.nonce_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 2. Idempotency cleanup (TTL 7 days) ──
  try {
    const { data: idempCount } = await db.rpc('cleanup_idempotency_keys');
    results.idempotency_cleaned = (idempCount as number) ?? 0;
  } catch (err) {
    results.idempotency_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 3. Stuck job detector (running, heartbeat > 5 min) ──
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: stuckJobs } = await db
      .from('processing_jobs')
      .select('id, processing_run_id, job_type, subject_user_id, subject_meeting_id, subject_group_proposal_id, expected_advisory_count')
      .eq('status', 'running')
      .or(`heartbeat_at.is.null,heartbeat_at.lt.${fiveMinAgo}`)
      .limit(10);

    let reconciled = 0;
    let failed = 0;

    for (const job of stuckJobs ?? []) {
      // Try to reconcile: szukaj sierocych advisories
      const { data: orphanAdvs } = await db
        .from('processing_advisories')
        .select('id, group_index')
        .eq('processing_run_id', job.processing_run_id as string)
        .eq('status', 'draft');

      if (orphanAdvs && orphanAdvs.length > 0) {
        // Reconcile: domknij job z advisories które istnieją
        const jobType = job.job_type as string;

        if (jobType === 'mapa_uwarunkowan' && orphanAdvs.length === 1) {
          // UC2: singular advisory
          await db.from('processing_jobs').update({
            status: 'done',
            result_advisory_id: orphanAdvs[0].id,
          }).eq('id', job.id).eq('status', 'running');
          reconciled++;
        } else if (jobType === 'group_enrichment') {
          // UC1: plural — wstaw junction rows
          for (const adv of orphanAdvs) {
            await db.from('processing_job_advisories').insert({
              job_id: job.id,
              advisory_id: adv.id as string,
              group_index: adv.group_index as number,
            }).then(() => {});
          }

          const expectedCount = job.expected_advisory_count as number | null;
          const newStatus =
            expectedCount != null && orphanAdvs.length < expectedCount
              ? 'done_partial'
              : expectedCount == null
                ? 'done_partial' // unknown expected = partial
                : 'done';

          await db.from('processing_jobs').update({
            status: newStatus,
            error_code: newStatus === 'done_partial' ? 'reconcile_partial_advisory_set' : null,
          }).eq('id', job.id).eq('status', 'running');
          reconciled++;
        } else {
          // Unexpected — fail
          await db.from('processing_jobs').update({
            status: 'failed',
            error_code: 'reconcile_ambiguous',
          }).eq('id', job.id).eq('status', 'running');
          failed++;
        }
      } else {
        // No advisories found — timeout_no_advisory
        await db.from('processing_jobs').update({
          status: 'failed',
          error_code: 'timeout_no_advisory',
        }).eq('id', job.id).eq('status', 'running');
        failed++;
      }
    }

    results.stuck_reconciled = reconciled;
    results.stuck_failed = failed;
  } catch (err) {
    results.stuck_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 4. Pending timeout (> 10 min) ──
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: pendingTimeout } = await db
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_code: 'pending_timeout',
      })
      .eq('status', 'pending')
      .lt('created_at', tenMinAgo)
      .select('id');

    results.pending_timed_out = pendingTimeout?.length ?? 0;
  } catch (err) {
    results.pending_timeout_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 5. Orphan draft GC (> 7 days, no link to job) ──
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Znajdź draft advisories bez linku do żadnego joba
    const { data: orphanDrafts } = await db
      .from('processing_advisories')
      .select('id')
      .eq('status', 'draft')
      .lt('created_at', sevenDaysAgo)
      .limit(50);

    let gcCount = 0;
    for (const draft of orphanDrafts ?? []) {
      // Check: czy jest linkowana przez result_advisory_id lub junction?
      const { data: jobLink } = await db
        .from('processing_jobs')
        .select('id')
        .eq('result_advisory_id', draft.id)
        .maybeSingle();

      const { data: junctionLink } = await db
        .from('processing_job_advisories')
        .select('job_id')
        .eq('advisory_id', draft.id)
        .maybeSingle();

      if (!jobLink && !junctionLink) {
        await db.from('processing_advisories').update({
          status: 'expired',
          error_code: 'orphan_draft_gc',
        }).eq('id', draft.id).eq('status', 'draft');
        gcCount++;
      }
    }
    results.orphan_gc = gcCount;
  } catch (err) {
    results.orphan_gc_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 6. Wall-clock cap (running > 45 min from created_at) ──
  try {
    const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const { data: wallClockJobs } = await db
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_code: 'wall_clock_exceeded',
      })
      .eq('status', 'running')
      .lt('created_at', fortyFiveMinAgo)
      .select('id');

    results.wall_clock_exceeded = wallClockJobs?.length ?? 0;
  } catch (err) {
    results.wall_clock_error = err instanceof Error ? err.message : 'unknown';
  }

  // ── 7. Version reservation cleanup (placeholder -1, > 1h) ──
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: cleanedReservations } = await db
      .from('version_reservations')
      .delete()
      .eq('version', -1)
      .lt('reserved_at', oneHourAgo)
      .select('processing_run_id');

    const cleaned = cleanedReservations?.length ?? 0;
    results.version_placeholder_cleaned = cleaned;

    if (cleaned > 0) {
      // PagerDuty-worthy: placeholder committed = atomicity violation
      console.error(
        `[processing-maintenance] WARNING: Found ${cleaned} version_reservations with placeholder -1 > 1h. ` +
        'This should not happen in normal operation — indicates atomicity violation in reserve_advisory_version. ' +
        'Investigate immediately.',
      );
    }
  } catch (err) {
    results.version_placeholder_error = err instanceof Error ? err.message : 'unknown';
  }

  return NextResponse.json({ ok: true, ...results });
}
