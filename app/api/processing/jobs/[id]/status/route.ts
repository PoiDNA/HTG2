/**
 * POST /api/processing/jobs/:id/status
 *
 * Multipurpose status callback: check-in (running), heartbeat, done, failed.
 * Worker używa attempt_id do lease ownership — HTG2 odrzuca callbacki
 * z attempt_id != current_attempt_id (409 lease_lost).
 *
 * Request body:
 *   {
 *     "status": "running" | "done" | "failed",
 *     "attempt_id": "uuid",
 *     "heartbeat_at"?: "ISO 8601",   // running + heartbeat
 *     "result_advisory_id"?: "uuid", // UC2 done
 *     "result_advisory_ids"?: [{advisory_id, group_index},...], // UC1 done
 *     "error_code"?: "string",       // failed
 *     "expected_advisory_count"?: number  // UC1, jednorazowe ustawienie
 *   }
 *
 * Patrz: docs/processing-service-plan.md §2.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { verifyProcessingRequest } from '@/lib/processing/hmac';
import { logProcessingExportAudit } from '@/lib/processing/audit';

interface StatusBody {
  status: 'running' | 'done' | 'failed';
  attempt_id: string;
  heartbeat_at?: string;
  result_advisory_id?: string;
  result_advisory_ids?: Array<{ advisory_id: string; group_index: number }>;
  error_code?: string;
  expected_advisory_count?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
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

  let body: StatusBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  if (!body.attempt_id || !body.status) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'attempt_id and status required' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // ── Fetch job + lease check ──
  const { data: job, error: jobErr } = await db
    .from('processing_jobs')
    .select('id, status, current_attempt_id, job_type, processing_run_id, subject_user_id, subject_meeting_id, subject_group_proposal_id, expected_advisory_count')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error_code: 'job_not_found', message: `Job ${jobId} not found` },
      { status: 404 },
    );
  }

  // ── Terminal check ──
  if (['done', 'done_partial', 'failed'].includes(job.status as string)) {
    return NextResponse.json(
      { error_code: 'job_already_terminal', message: `Job is ${job.status}` },
      { status: 409 },
    );
  }

  if (job.status === 'cancelled') {
    return NextResponse.json(
      { error_code: 'job_cancelled', message: 'Job was cancelled' },
      { status: 409 },
    );
  }

  // ── Handle based on requested status ──

  if (body.status === 'running') {
    return handleRunning(db, job, body, verify, startMs);
  }

  // For done/failed: must already be running + lease match
  if (job.status !== 'running') {
    return NextResponse.json(
      { error_code: 'invalid_transition', message: `Cannot transition from ${job.status} to ${body.status}` },
      { status: 409 },
    );
  }

  if (job.current_attempt_id !== body.attempt_id) {
    return NextResponse.json(
      { error_code: 'lease_lost', message: 'attempt_id does not match current lease holder' },
      { status: 409 },
    );
  }

  if (body.status === 'done') {
    return handleDone(db, job, body, verify, jobId, startMs);
  }

  if (body.status === 'failed') {
    return handleFailed(db, job, body, verify, jobId, startMs);
  }

  return NextResponse.json(
    { error_code: 'invalid_status', message: `Unknown status: ${body.status}` },
    { status: 400 },
  );
}

async function handleRunning(
  db: ReturnType<typeof createSupabaseServiceRole>,
  job: Record<string, unknown>,
  body: StatusBody,
  verify: { kid: string; serviceId: string },
  startMs: number,
) {
  const now = new Date().toISOString();

  if (job.status === 'pending') {
    // Check-in: pending → running, set attempt_id
    const { error } = await db
      .from('processing_jobs')
      .update({
        status: 'running',
        current_attempt_id: body.attempt_id,
        heartbeat_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json(
        { error_code: 'transition_failed', message: error.message },
        { status: 500 },
      );
    }
  } else if (job.status === 'running') {
    // Heartbeat lub idempotent check-in
    if (job.current_attempt_id === body.attempt_id) {
      // Same lease holder — heartbeat update
      const updatePayload: Record<string, unknown> = { heartbeat_at: now };

      // Jednorazowe ustawienie expected_advisory_count (UC1)
      if (
        body.expected_advisory_count != null &&
        job.expected_advisory_count == null
      ) {
        updatePayload.expected_advisory_count = body.expected_advisory_count;
      }

      await db
        .from('processing_jobs')
        .update(updatePayload)
        .eq('id', job.id);
    } else if (!job.current_attempt_id) {
      // Zombie: running without attempt_id (stale from before v9)
      await db
        .from('processing_jobs')
        .update({
          current_attempt_id: body.attempt_id,
          heartbeat_at: now,
        })
        .eq('id', job.id);
    } else {
      // Different attempt_id — check if current lease is stale (> 5 min)
      const heartbeatAt = job.heartbeat_at as string | null;
      const isStale = !heartbeatAt ||
        Date.now() - new Date(heartbeatAt).getTime() > 5 * 60 * 1000;

      if (isStale) {
        // Zombie takeover
        await db
          .from('processing_jobs')
          .update({
            current_attempt_id: body.attempt_id,
            heartbeat_at: now,
          })
          .eq('id', job.id);
      } else {
        return NextResponse.json(
          { error_code: 'lease_held', message: 'Another worker holds active lease' },
          { status: 409 },
        );
      }
    }
  } else {
    return NextResponse.json(
      { error_code: 'invalid_transition', message: `Cannot check-in: job is ${job.status}` },
      { status: 409 },
    );
  }

  void logProcessingExportAudit(db, {
    type: 'job_status',
    processing_run_id: job.processing_run_id as string,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { new_status: 'running', attempt_id: body.attempt_id },
  });

  return NextResponse.json({ ok: true, status: 'running' });
}

async function handleDone(
  db: ReturnType<typeof createSupabaseServiceRole>,
  job: Record<string, unknown>,
  body: StatusBody,
  verify: { kid: string; serviceId: string },
  jobId: string,
  startMs: number,
) {
  const jobType = job.job_type as string;

  // ── Idempotency check (Idempotency-Key header) ──
  const idempotencyKey = `${jobId}:done`;
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

  if (jobType === 'mapa_uwarunkowan') {
    // UC2: singular advisory
    if (!body.result_advisory_id) {
      return NextResponse.json(
        { error_code: 'missing_advisory_id', message: 'result_advisory_id required for UC2 done' },
        { status: 400 },
      );
    }

    // Verify advisory exists with matching run_id
    const { data: adv } = await db
      .from('processing_advisories')
      .select('id, processing_run_id')
      .eq('id', body.result_advisory_id)
      .eq('processing_run_id', job.processing_run_id as string)
      .maybeSingle();

    if (!adv) {
      return NextResponse.json(
        { error_code: 'advisory_not_found', message: 'Advisory not found or run_id mismatch' },
        { status: 409 },
      );
    }

    await db.from('processing_jobs').update({
      status: 'done',
      result_advisory_id: body.result_advisory_id,
    }).eq('id', jobId);

  } else if (jobType === 'group_enrichment') {
    // UC1: plural advisories
    if (!body.result_advisory_ids || body.result_advisory_ids.length === 0) {
      return NextResponse.json(
        { error_code: 'empty_advisories', message: 'result_advisory_ids required for UC1 done' },
        { status: 400 },
      );
    }

    // Verify each advisory + group_index match
    for (const item of body.result_advisory_ids) {
      const { data: adv } = await db
        .from('processing_advisories')
        .select('id, processing_run_id, group_index, subject_group_proposal_id')
        .eq('id', item.advisory_id)
        .eq('processing_run_id', job.processing_run_id as string)
        .single();

      if (!adv) {
        return NextResponse.json(
          { error_code: 'advisory_not_found', message: `Advisory ${item.advisory_id} not found or run_id mismatch` },
          { status: 409 },
        );
      }

      if ((adv.group_index as number) !== item.group_index) {
        return NextResponse.json(
          { error_code: 'group_index_mismatch', message: `Advisory ${item.advisory_id} has group_index=${adv.group_index}, not ${item.group_index}` },
          { status: 409 },
        );
      }

      if ((adv.subject_group_proposal_id as string) !== (job.subject_group_proposal_id as string)) {
        return NextResponse.json(
          { error_code: 'subject_mismatch', message: 'Advisory subject does not match job subject' },
          { status: 409 },
        );
      }
    }

    // Insert junction rows + update job
    for (const item of body.result_advisory_ids) {
      await db.from('processing_job_advisories').insert({
        job_id: jobId,
        advisory_id: item.advisory_id,
        group_index: item.group_index,
      });
    }

    await db.from('processing_jobs').update({
      status: 'done',
    }).eq('id', jobId);
  }

  const responseBody = { ok: true, status: 'done' };

  // Persist idempotency
  await db.from('idempotency_keys').insert({
    key: idempotencyKey,
    response_status: 200,
    response_body: responseBody,
  }).then(() => {});

  void logProcessingExportAudit(db, {
    type: 'job_status',
    processing_run_id: job.processing_run_id as string,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { new_status: 'done', job_type: jobType },
  });

  return NextResponse.json(responseBody);
}

async function handleFailed(
  db: ReturnType<typeof createSupabaseServiceRole>,
  job: Record<string, unknown>,
  body: StatusBody,
  verify: { kid: string; serviceId: string },
  jobId: string,
  startMs: number,
) {
  const idempotencyKey = `${jobId}:failed`;
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

  await db.from('processing_jobs').update({
    status: 'failed',
    error_code: body.error_code || 'worker_reported_failure',
  }).eq('id', jobId);

  const responseBody = { ok: true, status: 'failed' };

  await db.from('idempotency_keys').insert({
    key: idempotencyKey,
    response_status: 200,
    response_body: responseBody,
  }).then(() => {});

  void logProcessingExportAudit(db, {
    type: 'job_status',
    processing_run_id: job.processing_run_id as string,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { new_status: 'failed', error_code: body.error_code },
  });

  return NextResponse.json(responseBody);
}
