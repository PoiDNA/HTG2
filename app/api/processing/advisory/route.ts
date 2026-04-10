/**
 * POST /api/processing/advisory
 *
 * Write-back advisory od worker do HTG2. Worker wysyła distilled output
 * (nigdy raw transcript) jako draft advisory do akceptacji/odrzucenia
 * przez staff.
 *
 * Idempotent przez Idempotency-Key header (I3):
 *   UC2: {processing_run_id}:mapa_uwarunkowan:{version}
 *   UC1: {processing_run_id}:group_enrichment:{proposal_id}:{group_index}:{version}
 *
 * Lease ownership check: attempt_id match z current_attempt_id na
 * processing_jobs. Stary worker po utracie lease nie może zapisać advisory.
 *
 * Request body:
 *   {
 *     "processing_run_id": "uuid",
 *     "attempt_id": "uuid",
 *     "advisory_type": "mapa_uwarunkowan" | "group_enrichment",
 *     "subject_user_id"?: "uuid",          // UC2
 *     "subject_meeting_id"?: "uuid",       // UC1
 *     "subject_group_proposal_id"?: "uuid", // UC1
 *     "group_index"?: number,              // UC1
 *     "version": number,
 *     "doctrine_version": "string",
 *     "payload": { ... }                   // distilled advisory, never raw transcript
 *   }
 *
 * Response 200:
 *   { "advisory_id": "uuid" }
 *
 * Patrz: docs/processing-service-plan.md §8
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { verifyProcessingRequest } from '@/lib/processing/hmac';
import { logProcessingExportAudit } from '@/lib/processing/audit';

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const rawBody = await request.text();

  const verify = await verifyProcessingRequest(request, rawBody, {
    expectedDirection: 'worker_to_htg2',
  });
  if (!verify.ok) {
    return NextResponse.json(
      { error_code: verify.errorCode, message: verify.message },
      { status: verify.status },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  const {
    processing_run_id,
    attempt_id,
    advisory_type,
    version,
    doctrine_version,
    payload,
  } = body as {
    processing_run_id?: string;
    attempt_id?: string;
    advisory_type?: string;
    version?: number;
    doctrine_version?: string;
    payload?: unknown;
  };

  if (!processing_run_id || !attempt_id || !advisory_type || version == null || !doctrine_version || !payload) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'Missing required fields' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // ── Idempotency check (Idempotency-Key header) ──
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return NextResponse.json(
      { error_code: 'missing_idempotency_key', message: 'Idempotency-Key header required' },
      { status: 400 },
    );
  }

  const { data: existingKey } = await db
    .from('idempotency_keys')
    .select('response_body, response_status')
    .eq('key', idempotencyKey)
    .maybeSingle();

  if (existingKey) {
    return NextResponse.json(existingKey.response_body, {
      status: existingKey.response_status as number,
    });
  }

  // ── Lease ownership + subject match check ──
  const { data: job } = await db
    .from('processing_jobs')
    .select('id, status, current_attempt_id, job_type, subject_user_id, subject_meeting_id, subject_group_proposal_id')
    .eq('processing_run_id', processing_run_id)
    .single();

  if (!job) {
    return NextResponse.json(
      { error_code: 'job_not_found' },
      { status: 404 },
    );
  }

  if (job.status !== 'running') {
    return NextResponse.json(
      { error_code: 'job_terminal', message: `Job is ${job.status}` },
      { status: 409 },
    );
  }

  if (job.current_attempt_id !== attempt_id) {
    return NextResponse.json(
      { error_code: 'lease_lost' },
      { status: 409 },
    );
  }

  if (job.job_type !== advisory_type) {
    return NextResponse.json(
      { error_code: 'subject_mismatch', message: `Job type ${job.job_type} != ${advisory_type}` },
      { status: 409 },
    );
  }

  // ── Build advisory row ──
  const advisoryRow: Record<string, unknown> = {
    advisory_type,
    version,
    doctrine_version,
    processing_run_id,
    payload,
    status: 'draft',
  };

  if (advisory_type === 'mapa_uwarunkowan') {
    advisoryRow.subject_user_id = body.subject_user_id ?? job.subject_user_id;
    if (advisoryRow.subject_user_id !== job.subject_user_id) {
      return NextResponse.json(
        { error_code: 'subject_mismatch', message: 'subject_user_id does not match job' },
        { status: 409 },
      );
    }
  } else {
    advisoryRow.subject_meeting_id = body.subject_meeting_id ?? job.subject_meeting_id;
    advisoryRow.subject_group_proposal_id = body.subject_group_proposal_id ?? job.subject_group_proposal_id;
    advisoryRow.group_index = body.group_index;

    if (
      advisoryRow.subject_group_proposal_id !== job.subject_group_proposal_id ||
      advisoryRow.subject_meeting_id !== job.subject_meeting_id
    ) {
      return NextResponse.json(
        { error_code: 'subject_mismatch', message: 'subject fields do not match job' },
        { status: 409 },
      );
    }

    if (typeof advisoryRow.group_index !== 'number') {
      return NextResponse.json(
        { error_code: 'invalid_body', message: 'group_index required for group_enrichment' },
        { status: 400 },
      );
    }
  }

  // ── Insert advisory + idempotency key in "transaction" ──
  // Supabase JS doesn't support explicit transactions — we rely on
  // unique constraint on idempotency_keys as atomicity guard.
  const { data: inserted, error: insertErr } = await db
    .from('processing_advisories')
    .insert(advisoryRow)
    .select('id')
    .single();

  if (insertErr) {
    // Unique violation = duplicate version for this subject
    if ((insertErr as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error_code: 'version_conflict', message: 'Advisory version already exists' },
        { status: 409 },
      );
    }
    console.error('[advisory] insert failed:', insertErr);
    return NextResponse.json(
      { error_code: 'internal_error', message: insertErr.message },
      { status: 500 },
    );
  }

  const responseBody = { advisory_id: inserted.id };

  // Persist idempotency key
  await db.from('idempotency_keys').insert({
    key: idempotencyKey,
    response_status: 200,
    response_body: responseBody,
  }).then(() => {});

  void logProcessingExportAudit(db, {
    type: 'write_back_advisory',
    processing_run_id,
    target_user_id: (advisoryRow.subject_user_id as string) ?? null,
    target_meeting_id: (advisoryRow.subject_meeting_id as string) ?? null,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { advisory_type, version, group_index: advisoryRow.group_index },
  });

  return NextResponse.json(responseBody);
}
