/**
 * POST /api/processing/export-dossiers-batch
 *
 * Batch dossier export endpoint dla UC1 (group enrichment).
 * Worker wywołuje z HMAC-signed request żeby pobrać snapshoty Dossier
 * dla uczestników jednego meeting (N ≤ 16 userów).
 *
 * Logiczny snapshot per user (nie jedna gigantyczna transakcja RR):
 * - Każdy user iterowany sekwencyjnie przez buildDossierData
 * - Fingerprint check per user — jeśli się zmienił w trakcie, user w stale_users[]
 * - Batch response zawiera mieszankę {ok, stale, not_analyzable}
 *
 * Request body:
 *   {
 *     "meeting_id": "uuid",
 *     "user_ids": ["uuid", ...]   // ≤ 16
 *   }
 *
 * Response 200:
 *   {
 *     "snapshot_at": "ISO 8601",
 *     "results": [
 *       { "user_id": "uuid", "status": "ok", "scope_key": "...", "bookings_used": [...],
 *         "consent_fingerprint": "...", "dossier_data": {...} },
 *       { "user_id": "uuid", "status": "stale" },
 *       { "user_id": "uuid", "status": "not_analyzable", "missing": ["sensitive_data"] }
 *     ]
 *   }
 *
 * Worker reaguje na stale przez retry całego batcha (plan I2 algebra v10).
 * not_analyzable jest terminal dla danego usera w tym run.
 *
 * Patrz: docs/processing-service-plan.md §3.2, §6 UC1, I2
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

const MAX_BATCH_SIZE = 16;

interface BatchResultOk {
  user_id: string;
  status: 'ok';
  scope_key: string;
  bookings_used: string[];
  consent_fingerprint: string;
  dossier_data: unknown;
}

interface BatchResultStale {
  user_id: string;
  status: 'stale';
}

interface BatchResultNotAnalyzable {
  user_id: string;
  status: 'not_analyzable';
  missing: string[];
}

type BatchResult = BatchResultOk | BatchResultStale | BatchResultNotAnalyzable;

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const rawBody = await request.text();

  // ── Step 1: HMAC verify ──
  const verify = await verifyProcessingRequest(request, rawBody, {
    expectedDirection: 'worker_to_htg2',
  });
  if (!verify.ok) {
    return NextResponse.json(
      { error_code: verify.errorCode, message: verify.message },
      { status: verify.status },
    );
  }

  // ── Step 2: Parse request ──
  let parsed: { meeting_id?: unknown; user_ids?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'Body is not valid JSON' },
      { status: 400 },
    );
  }

  const meetingId = parsed.meeting_id;
  const userIds = parsed.user_ids;
  if (typeof meetingId !== 'string' || !Array.isArray(userIds)) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'meeting_id (string) and user_ids (array) required' },
      { status: 400 },
    );
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(meetingId)) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'meeting_id must be UUID' },
      { status: 400 },
    );
  }

  if (userIds.length === 0 || userIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      {
        error_code: 'invalid_body',
        message: `user_ids must have 1..${MAX_BATCH_SIZE} items`,
      },
      { status: 400 },
    );
  }

  for (const uid of userIds) {
    if (typeof uid !== 'string' || !uuidRe.test(uid)) {
      return NextResponse.json(
        { error_code: 'invalid_body', message: 'All user_ids must be UUID strings' },
        { status: 400 },
      );
    }
  }

  const db = createSupabaseServiceRole();
  const snapshotAt = new Date().toISOString();
  const results: BatchResult[] = [];

  // ── Step 3: Iterate userów sekwencyjnie ──
  // Każdy user: gate check → fingerprint_begin → build dossier → fingerprint_end
  // Jeśli fingerprint_begin != fingerprint_end → stale
  for (const userId of userIds as string[]) {
    try {
      // Meeting-level gate check
      const { data: gateResult, error: gateError } = await db.rpc(
        'check_processing_export_consent_meeting',
        {
          p_meeting_id: meetingId,
          p_user_id: userId,
          p_require_sensitive: true,
        },
      );

      if (gateError) {
        console.error(`[export-batch] gate RPC failed for ${userId}:`, gateError);
        results.push({
          user_id: userId,
          status: 'not_analyzable',
          missing: ['rpc_error'],
        });
        continue;
      }

      const gateRow = Array.isArray(gateResult) ? gateResult[0] : gateResult;
      if (!gateRow?.passed) {
        results.push({
          user_id: userId,
          status: 'not_analyzable',
          missing: (gateRow?.missing as string[] | null) ?? ['unknown'],
        });
        continue;
      }

      // Build bookings_used[] + compute fingerprint_begin
      const bookingsUsed = await buildBookingsUsed(db, userId);
      const fingerprintBegin = await computeConsentFingerprint(db, userId, bookingsUsed);

      // Build Dossier snapshot
      const dossierData = await buildDossierData(db, userId, null, bookingsUsed);

      // Compute fingerprint_end — jeśli się zmienił w trakcie, stale
      const fingerprintEnd = await computeConsentFingerprint(db, userId, bookingsUsed);
      if (fingerprintBegin !== fingerprintEnd) {
        results.push({ user_id: userId, status: 'stale' });
        continue;
      }

      const scopeKey = computeScopeKey(userId, bookingsUsed);

      // Upsert scope whitelist
      await db.rpc('processing_export_subjects_upsert', {
        p_service_id: verify.serviceId,
        p_user_id: userId,
        p_booking_ids: bookingsUsed,
      });

      results.push({
        user_id: userId,
        status: 'ok',
        scope_key: scopeKey,
        bookings_used: bookingsUsed,
        consent_fingerprint: fingerprintEnd,
        dossier_data: dossierData,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export-batch] build failed for ${userId}:`, message);
      results.push({
        user_id: userId,
        status: 'not_analyzable',
        missing: ['build_failed'],
      });
    }
  }

  // ── Step 4: Aggregate audit log ──
  const okCount = results.filter((r) => r.status === 'ok').length;
  const staleCount = results.filter((r) => r.status === 'stale').length;
  const notAnalyzableCount = results.filter((r) => r.status === 'not_analyzable').length;

  void logProcessingExportAudit(db, {
    type: 'export_batch',
    target_meeting_id: meetingId,
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: okCount > 0,
    latency_ms: Date.now() - startMs,
    details: {
      requested_count: userIds.length,
      ok_count: okCount,
      stale_count: staleCount,
      not_analyzable_count: notAnalyzableCount,
    },
  });

  return NextResponse.json({
    snapshot_at: snapshotAt,
    results,
  });
}
