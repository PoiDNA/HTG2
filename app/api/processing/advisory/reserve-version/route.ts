/**
 * POST /api/processing/advisory/reserve-version
 *
 * Atomowa rezerwacja wersji dla processing_advisories. Worker wywołuje
 * PRZED write-back advisory żeby uzyskać version potrzebne do budowy
 * Idempotency-Key (format I3 §2.1: {run_id}:{type}:{version}).
 *
 * Idempotent: powtórne wywołanie z tym samym (processing_run_id, advisory_type,
 * subject_key) zwraca tę samą wersję. Lock-first pattern w RPC
 * reserve_advisory_version (mig 064).
 *
 * Lease ownership check: wymaga aktywnego lease (status=running, attempt_id match).
 *
 * Request body:
 *   {
 *     "processing_run_id": "uuid",
 *     "attempt_id": "uuid",
 *     "advisory_type": "mapa_uwarunkowan" | "group_enrichment",
 *     "subject_key": "mapa_uwarunkowan:{user_id}" | "group_enrichment:{proposal_id}:{group_index}"
 *   }
 *
 * Response 200:
 *   { "version": 1 }
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

  let body: {
    processing_run_id?: string;
    attempt_id?: string;
    advisory_type?: string;
    subject_key?: string;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  const { processing_run_id, attempt_id, advisory_type, subject_key } = body;
  if (!processing_run_id || !attempt_id || !advisory_type || !subject_key) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'processing_run_id, attempt_id, advisory_type, subject_key required' },
      { status: 400 },
    );
  }

  if (!['mapa_uwarunkowan', 'group_enrichment'].includes(advisory_type)) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'advisory_type must be mapa_uwarunkowan or group_enrichment' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // ── Lease ownership check ──
  const { data: job } = await db
    .from('processing_jobs')
    .select('id, status, current_attempt_id, job_type')
    .eq('processing_run_id', processing_run_id)
    .single();

  if (!job) {
    return NextResponse.json(
      { error_code: 'job_not_found', message: `No job with processing_run_id ${processing_run_id}` },
      { status: 404 },
    );
  }

  if (job.status !== 'running') {
    return NextResponse.json(
      { error_code: 'job_terminal', message: `Job is ${job.status}, not running` },
      { status: 409 },
    );
  }

  if (job.current_attempt_id !== attempt_id) {
    return NextResponse.json(
      { error_code: 'lease_lost', message: 'attempt_id does not match current lease holder' },
      { status: 409 },
    );
  }

  // Type match check
  if (job.job_type !== advisory_type) {
    return NextResponse.json(
      { error_code: 'subject_mismatch', message: `Job type ${job.job_type} does not match advisory_type ${advisory_type}` },
      { status: 409 },
    );
  }

  // ── Reserve version via RPC ──
  const { data: version, error: rpcErr } = await db.rpc('reserve_advisory_version', {
    p_processing_run_id: processing_run_id,
    p_advisory_type: advisory_type,
    p_subject_key: subject_key,
  });

  if (rpcErr) {
    console.error('[reserve-version] RPC error:', rpcErr);
    return NextResponse.json(
      { error_code: 'internal_error', message: rpcErr.message },
      { status: 500 },
    );
  }

  void logProcessingExportAudit(db, {
    type: 'reserve_version',
    processing_run_id,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { advisory_type, subject_key, version },
  });

  return NextResponse.json({ version });
}
