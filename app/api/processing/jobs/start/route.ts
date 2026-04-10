/**
 * POST /api/processing/jobs/start
 *
 * Tworzy processing_jobs row dla UC1 (group enrichment) i wysyła job do
 * workera. Wywoływane z HTG2 admin UI gdy admin klika "Wzbogać propozycję grup".
 *
 * Ten endpoint NIE jest HMAC-verified (pochodzi z admin UI w HTG2, nie od
 * external workera) — weryfikuje auth sesji admina przez Supabase Auth.
 * Po utworzeniu joba, HTG2 powinien powiadomić workera (webhook lub polling).
 *
 * Idempotent: aktywny (pending/running) job dla tego proposal → zwraca istniejący.
 *
 * Request body:
 *   { "meeting_id": "uuid", "group_proposal_id": "uuid" }
 *
 * Response 200:
 *   { "job_id": "uuid", "processing_run_id": "uuid", "created": true|false }
 *
 * Patrz: docs/processing-service-plan.md §2.2, §6 UC1
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { logProcessingExportAudit } from '@/lib/processing/audit';
import { ADMIN_EMAILS } from '@/lib/roles';

export async function POST(request: NextRequest) {
  const startMs = Date.now();

  // Auth: admin session
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error_code: 'unauthorized' }, { status: 401 });
  }

  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
  if (!isAdmin) {
    return NextResponse.json({ error_code: 'forbidden' }, { status: 403 });
  }

  let parsed: { meeting_id?: unknown; group_proposal_id?: unknown };
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  const meetingId = parsed.meeting_id;
  const proposalId = parsed.group_proposal_id;
  if (typeof meetingId !== 'string' || typeof proposalId !== 'string') {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'meeting_id and group_proposal_id required' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // Idempotent: aktywny UC1 job dla tego proposal
  const { data: existing } = await db
    .from('processing_jobs')
    .select('id, processing_run_id')
    .eq('job_type', 'group_enrichment')
    .eq('subject_group_proposal_id', proposalId)
    .in('status', ['pending', 'running'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      job_id: existing.id,
      processing_run_id: existing.processing_run_id,
      created: false,
    });
  }

  const { data: newJob, error: insertErr } = await db
    .from('processing_jobs')
    .insert({
      job_type: 'group_enrichment',
      subject_meeting_id: meetingId,
      subject_group_proposal_id: proposalId,
      status: 'pending',
      created_by: user.id,
    })
    .select('id, processing_run_id')
    .single();

  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') {
      const { data: retry } = await db
        .from('processing_jobs')
        .select('id, processing_run_id')
        .eq('job_type', 'group_enrichment')
        .eq('subject_group_proposal_id', proposalId)
        .in('status', ['pending', 'running'])
        .maybeSingle();
      if (retry) {
        return NextResponse.json({
          job_id: retry.id,
          processing_run_id: retry.processing_run_id,
          created: false,
        });
      }
    }
    console.error('[jobs/start] insert failed:', insertErr);
    return NextResponse.json(
      { error_code: 'internal_error', message: 'Failed to create job' },
      { status: 500 },
    );
  }

  void logProcessingExportAudit(db, {
    type: 'job_start',
    processing_run_id: newJob.processing_run_id as string,
    target_meeting_id: meetingId,
    caller_service_id: 'htg2-admin',
    caller_kid: 'internal',
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { proposal_id: proposalId, created_by: user.id },
  });

  return NextResponse.json({
    job_id: newJob.id,
    processing_run_id: newJob.processing_run_id,
    created: true,
  });
}
