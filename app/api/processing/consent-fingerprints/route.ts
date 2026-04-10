/**
 * POST /api/processing/consent-fingerprints
 *
 * Scope-keyed reconcile: worker wysyła listę scope items ({user_id,
 * bookings_used[]}) i dostaje fingerprinty dla każdego scope. Worker
 * porównuje z lokalnymi Dossier fingerprintami — mismatch → purge.
 *
 * Scope-keyed autoryzacja (v12): sprawdza że KAŻDY booking w
 * bookings_used[] jest podzbiorem wcześniej eksportowanych bookingów
 * dla tego service_id. Blokuje sondowanie arbitralnych bookingów.
 *
 * null response nierozróżnialny od: (a) purged, (b) never existed,
 * (c) out of scope. Blokuje enumerację.
 *
 * Request body:
 *   {
 *     "scopes": [
 *       { "user_id": "uuid", "bookings_used": ["uuid", ...] },
 *       ...
 *     ]
 *   }
 *
 * Max 500 scope items per request. Rate limit 1 req/s per KID.
 *
 * Response 200:
 *   {
 *     "results": [
 *       { "scope_key": "sha256", "fingerprint": "sha256" | null },
 *       ...
 *     ]
 *   }
 *
 * Patrz: docs/processing-service-plan.md §20.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { verifyProcessingRequest } from '@/lib/processing/hmac';
import { computeConsentFingerprint, computeScopeKey } from '@/lib/processing/dossier';
import { logProcessingExportAudit } from '@/lib/processing/audit';

const MAX_SCOPE_ITEMS = 500;

interface ScopeItem {
  user_id: string;
  bookings_used: string[];
}

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

  let parsed: { scopes?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error_code: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(parsed.scopes) || parsed.scopes.length === 0) {
    return NextResponse.json(
      { error_code: 'invalid_body', message: 'scopes array required (1..500)' },
      { status: 400 },
    );
  }

  if (parsed.scopes.length > MAX_SCOPE_ITEMS) {
    return NextResponse.json(
      { error_code: 'too_many_scopes', message: `Max ${MAX_SCOPE_ITEMS} scope items per request` },
      { status: 400 },
    );
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const scopes: ScopeItem[] = [];
  for (const s of parsed.scopes as unknown[]) {
    const item = s as Record<string, unknown>;
    if (typeof item?.user_id !== 'string' || !uuidRe.test(item.user_id)) {
      return NextResponse.json(
        { error_code: 'invalid_body', message: 'Each scope must have valid user_id UUID' },
        { status: 400 },
      );
    }
    const bookingsUsed = Array.isArray(item.bookings_used) ? item.bookings_used : [];
    for (const b of bookingsUsed) {
      if (typeof b !== 'string' || !uuidRe.test(b)) {
        return NextResponse.json(
          { error_code: 'invalid_body', message: 'Each booking_id in bookings_used must be valid UUID' },
          { status: 400 },
        );
      }
    }
    scopes.push({ user_id: item.user_id, bookings_used: bookingsUsed as string[] });
  }

  const db = createSupabaseServiceRole();
  const results: Array<{ scope_key: string; fingerprint: string | null }> = [];
  let matchedCount = 0;

  for (const scope of scopes) {
    const scopeKey = computeScopeKey(scope.user_id, scope.bookings_used);

    // Scope-keyed authorization check
    const { data: authorized } = await db.rpc('processing_export_scope_authorized', {
      p_service_id: verify.serviceId,
      p_user_id: scope.user_id,
      p_booking_ids: scope.bookings_used.length > 0 ? scope.bookings_used : null,
    });

    if (!authorized) {
      // null — indistinguishable from purged/nonexistent
      results.push({ scope_key: scopeKey, fingerprint: null });
      continue;
    }

    // Compute current fingerprint
    try {
      const fingerprint = await computeConsentFingerprint(
        db,
        scope.user_id,
        scope.bookings_used,
      );
      results.push({ scope_key: scopeKey, fingerprint });
      matchedCount++;
    } catch {
      results.push({ scope_key: scopeKey, fingerprint: null });
    }
  }

  void logProcessingExportAudit(db, {
    type: 'fingerprint_check',
    caller_service_id: verify.serviceId,
    caller_kid: verify.kid,
    passed: true,
    latency_ms: Date.now() - startMs,
    details: {
      scopes_count: scopes.length,
      matched_count: matchedCount,
    },
  });

  return NextResponse.json({ results });
}
