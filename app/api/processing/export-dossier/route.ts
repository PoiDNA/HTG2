/**
 * POST /api/processing/export-dossier
 *
 * Single dossier export endpoint dla UC2 (Mapa Uwarunkowań).
 * Worker (htg-processing) wywołuje z HMAC-signed request żeby pobrać
 * snapshot Dossier dla jednego (booking_id, user_id).
 *
 * Request body (canonical JSON):
 *   {
 *     "booking_id": "uuid",
 *     "user_id": "uuid"
 *   }
 *
 * Response 200:
 *   {
 *     "user_id": "uuid",
 *     "snapshot_at": "ISO 8601",
 *     "export_schema_version": "1.0.0",
 *     "scope_key": "sha256 hex",
 *     "bookings_used": ["uuid", ...],
 *     "consent_fingerprint": "sha256 hex",
 *     "dossier_data": { ... }
 *   }
 *
 * Error responses:
 *   400 missing_headers | invalid_body — HMAC request invalid
 *   401 timestamp_expired | unknown_kid | invalid_signature — HMAC auth failed
 *   403 wrong_direction — KID direction mismatch
 *   409 replay_detected — nonce replayed
 *   409 consent_missing — consent gate failed (missing[] details)
 *   500 internal_error
 *
 * Patrz: docs/processing-service-plan.md §3.2, §6 UC2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { verifyProcessingRequest } from '@/lib/processing/hmac';
import {
  buildBookingsUsed,
  buildDossierData,
  computeConsentFingerprint,
  computeScopeKey,
  EXPORT_SCHEMA_VERSION,
} from '@/lib/processing/dossier';
import { logProcessingExportAudit } from '@/lib/processing/audit';

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const rawBody = await request.text();

  // ── Step 1: HMAC verify (headers + signature + anti-replay) ──
  const verify = await verifyProcessingRequest(request, rawBody, {
    expectedDirection: 'worker_to_htg2',
  });

  if (!verify.ok) {
    return NextResponse.json(
      { error_code: verify.errorCode, message: verify.message },
      { status: verify.status },
    );
  }

  // ── Step 2: Parse + validate request body ──
  let parsed: { booking_id?: unknown; user_id?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'Body is not valid JSON' },
      { status: 400 },
    );
  }

  const bookingId = parsed.booking_id;
  const userId = parsed.user_id;
  if (typeof bookingId !== 'string' || typeof userId !== 'string') {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'booking_id and user_id required as strings' },
      { status: 400 },
    );
  }

  // UUID format sanity
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(bookingId) || !uuidRe.test(userId)) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'booking_id and user_id must be UUID format' },
      { status: 400 },
    );
  }

  const db = createSupabaseServiceRole();

  // ── Step 3: Consent gate — check_processing_export_consent ──
  const { data: gateResult, error: gateError } = await db.rpc(
    'check_processing_export_consent',
    {
      p_booking_id: bookingId,
      p_user_id: userId,
      p_require_sensitive: true,  // Phase 1 MVP: jednolita polityka art. 9
    },
  );

  if (gateError) {
    console.error('[export-dossier] consent gate RPC failed:', gateError);
    void logProcessingExportAudit(db, {
      type: 'export_single',
      target_user_id: userId,
      target_booking_id: bookingId,
      caller_service_id: verify.serviceId,
      caller_kid: verify.kid,
      passed: false,
      error_code: 'rpc_error',
      latency_ms: Date.now() - startMs,
    });
    return NextResponse.json(
      { error_code: 'internal_error', message: 'Consent gate check failed' },
      { status: 500 },
    );
  }

  const gateRow = Array.isArray(gateResult) ? gateResult[0] : gateResult;
  if (!gateRow?.passed) {
    const missing = (gateRow?.missing as string[] | null) ?? ['unknown'];
    void logProcessingExportAudit(db, {
      type: 'export_single',
      target_user_id: userId,
      target_booking_id: bookingId,
      caller_service_id: verify.serviceId,
      caller_kid: verify.kid,
      passed: false,
      missing,
      error_code: 'consent_missing',
      latency_ms: Date.now() - startMs,
    });
    return NextResponse.json(
      { error_code: 'consent_missing', message: 'Consent gate failed', missing },
      { status: 409 },
    );
  }

  // ── Step 4: Build bookings_used[] + Dossier snapshot ──
  try {
    const bookingsUsed = await buildBookingsUsed(db, userId);
    const dossierData = await buildDossierData(db, userId, bookingId, bookingsUsed);
    const scopeKey = computeScopeKey(userId, bookingsUsed);
    const fingerprint = await computeConsentFingerprint(db, userId, bookingsUsed);
    const snapshotAt = new Date().toISOString();

    // ── Step 5: Upsert processing_export_subjects scope whitelist ──
    await db.rpc('processing_export_subjects_upsert', {
      p_service_id: verify.serviceId,
      p_user_id: userId,
      p_booking_ids: bookingsUsed,
    });

    // ── Step 6: Audit log success ──
    void logProcessingExportAudit(db, {
      type: 'export_single',
      target_user_id: userId,
      target_booking_id: bookingId,
      caller_service_id: verify.serviceId,
      caller_kid: verify.kid,
      passed: true,
      latency_ms: Date.now() - startMs,
      details: {
        bookings_used_count: bookingsUsed.length,
        insights_count: dossierData.session.transcripts_count,
      },
    });

    return NextResponse.json({
      user_id: userId,
      snapshot_at: snapshotAt,
      export_schema_version: EXPORT_SCHEMA_VERSION,
      scope_key: scopeKey,
      bookings_used: bookingsUsed,
      consent_fingerprint: fingerprint,
      dossier_data: dossierData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[export-dossier] build failed:', message);
    void logProcessingExportAudit(db, {
      type: 'export_single',
      target_user_id: userId,
      target_booking_id: bookingId,
      caller_service_id: verify.serviceId,
      caller_kid: verify.kid,
      passed: null,
      error_code: 'build_failed',
      latency_ms: Date.now() - startMs,
    });
    return NextResponse.json(
      { error_code: 'internal_error', message },
      { status: 500 },
    );
  }
}
