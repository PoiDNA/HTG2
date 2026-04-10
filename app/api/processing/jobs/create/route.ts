/**
 * POST /api/processing/jobs/create
 *
 * Tworzy processing_jobs row dla UC2 (Mapa Uwarunkowań). Wywoływane
 * przez worker (htg-processing) gdy staff klika "Stwórz Mapę" w UI
 * workera. HTG2 jest jedynym źródłem prawdy dla processing_jobs.
 *
 * Idempotent: jeśli istnieje już aktywny (pending/running) job dla tego
 * subject_user_id → zwraca istniejący {job_id, processing_run_id}
 * zamiast 409 (idempotent drugi klik UX).
 *
 * Request body:
 *   { "subject_user_id": "uuid" }
 *
 * Response 200:
 *   { "job_id": "uuid", "processing_run_id": "uuid", "created": true|false }
 *
 * Patrz: docs/processing-service-plan.md §2.2, §6 UC2
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

  let parsed: { subject_user_id?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  const subjectUserId = parsed.subject_user_id;
  if (typeof subjectUserId !== 'string') {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'subject_user_id required' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // Idempotent: sprawdź czy istnieje aktywny UC2 job dla tego usera
  const { data: existing } = await db
    .from('processing_jobs')
    .select('id, processing_run_id')
    .eq('job_type', 'mapa_uwarunkowan')
    .eq('subject_user_id', subjectUserId)
    .in('status', ['pending', 'running'])
    .maybeSingle();

  if (existing) {
    void logProcessingExportAudit(db, {
      type: 'job_create',
      target_user_id: subjectUserId,
      caller_service_id: verify.serviceId,
      caller_kid: verify.kid,
      passed: true,
      latency_ms: Date.now() - startMs,
      details: { idempotent_hit: true, existing_job_id: existing.id },
    });
    return NextResponse.json({
      job_id: existing.id,
      processing_run_id: existing.processing_run_id,
      created: false,
    });
  }

  // Tworzenie nowego joba
  const { data: newJob, error: insertErr } = await db
    .from('processing_jobs')
    .insert({
      job_type: 'mapa_uwarunkowan',
      subject_user_id: subjectUserId,
      status: 'pending',
    })
    .select('id, processing_run_id')
    .single();

  if (insertErr) {
    // Unique constraint violation = concurrent insert → retry as idempotent
    if ((insertErr as { code?: string }).code === '23505') {
      const { data: retry } = await db
        .from('processing_jobs')
        .select('id, processing_run_id')
        .eq('job_type', 'mapa_uwarunkowan')
        .eq('subject_user_id', subjectUserId)
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
    console.error('[jobs/create] insert failed:', insertErr);
    return NextResponse.json(
      { error_code: 'internal_error', message: 'Failed to create job' },
      { status: 500 },
    );
  }

  void logProcessingExportAudit(db, {
    type: 'job_create',
    processing_run_id: newJob.processing_run_id as string,
    target_user_id: subjectUserId,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: { created: true },
  });

  return NextResponse.json({
    job_id: newJob.id,
    processing_run_id: newJob.processing_run_id,
    created: true,
  });
}
