/**
 * HMAC request verification dla processing service endpoints.
 *
 * Weryfikuje inbound requesty od worker (htg-processing) do HTG2:
 * - Headers: X-Processing-Timestamp, X-Processing-Nonce, X-Processing-Signature,
 *   X-Processing-Key-Id, opcjonalnie Idempotency-Key
 * - Signature: HMAC-SHA256(secret, timestamp || ":" || nonce || ":" || sha256(canonical_body))
 * - Anti-replay: timestamp window 5 min + nonce store w processing_nonce_store
 *   (tabela Supabase, nie Upstash — odchylenie od planu, patrz mig 068)
 * - Constant-time signature comparison (timingSafeEqual) — ochrona przed
 *   timing attack
 *
 * Direction enforcement: handler wywołujący `verifyProcessingRequest` podaje
 * `expectedDirection` — 'worker_to_htg2' dla endpointów inbound od workera.
 * Jeśli KID zidentyfikowany jako HTG2→worker (wrong direction), request
 * jest odrzucony mimo valid signature. Zapobiega impersonacji cross-direction
 * przy wycieku jednego sekretu.
 *
 * Patrz: docs/processing-service-plan.md §2.1, §20.1
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { parseAndCanonicalize } from './canonical-body';
import { deriveServiceId, resolveKid, type HmacDirection } from './secrets';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export type VerifyResult =
  | { ok: true; kid: string; serviceId: string; canonicalBodyBytes: Buffer }
  | { ok: false; status: number; errorCode: string; message: string };

export interface VerifyOptions {
  expectedDirection: HmacDirection;
  maxClockSkewSeconds?: number;  // default 300 (5 min)
}

/**
 * Weryfikuje inbound request HMAC + anti-replay.
 *
 * Kolejność walidacji (fail-fast):
 * 1. Sprawdź obecność wszystkich wymaganych headers → 400 missing_headers
 * 2. Parse timestamp → 400 invalid_timestamp
 * 3. Timestamp window check → 401 timestamp_expired
 * 4. Resolve KID → 401 unknown_kid
 * 5. Direction check → 403 wrong_direction
 * 6. Compute expected signature → constant-time compare → 401 invalid_signature
 * 7. Anti-replay: atomic INSERT nonce → 409 replay_detected przy conflict
 *
 * Kroki 1-5 są tanie (nie dotykają DB). Krok 6 jest constant-time (cryptographic).
 * Krok 7 jest jedynym DB round-trip dla valid requesta.
 */
export async function verifyProcessingRequest(
  request: Request,
  rawBody: string,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const maxSkew = opts.maxClockSkewSeconds ?? 300;

  // ── 1. Wymagane headers ──────────────────────────────────────
  const timestampHeader = request.headers.get('X-Processing-Timestamp');
  const nonceHeader     = request.headers.get('X-Processing-Nonce');
  const signatureHeader = request.headers.get('X-Processing-Signature');
  const kidHeader       = request.headers.get('X-Processing-Key-Id');

  if (!timestampHeader || !nonceHeader || !signatureHeader || !kidHeader) {
    return {
      ok: false,
      status: 400,
      errorCode: 'missing_headers',
      message: 'Required HMAC headers missing',
    };
  }

  // ── 2. Parse timestamp (epoch ms lub sekundy — akceptujemy oba) ─
  const timestampMs = parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return {
      ok: false,
      status: 400,
      errorCode: 'invalid_timestamp',
      message: 'Timestamp must be positive epoch milliseconds',
    };
  }

  // ── 3. Clock skew check ──────────────────────────────────────
  const nowMs = Date.now();
  const skewMs = Math.abs(nowMs - timestampMs);
  if (skewMs > maxSkew * 1000) {
    return {
      ok: false,
      status: 401,
      errorCode: 'timestamp_expired',
      message: `Timestamp drift ${Math.floor(skewMs / 1000)}s exceeds max ${maxSkew}s`,
    };
  }

  // ── 4. Resolve KID → secret ──────────────────────────────────
  const kidEntry = resolveKid(kidHeader);
  if (!kidEntry) {
    return {
      ok: false,
      status: 401,
      errorCode: 'unknown_kid',
      message: `Unknown KID: ${kidHeader}`,
    };
  }

  // ── 5. Direction check ───────────────────────────────────────
  if (kidEntry.direction !== opts.expectedDirection) {
    return {
      ok: false,
      status: 403,
      errorCode: 'wrong_direction',
      message: `KID direction ${kidEntry.direction} does not match expected ${opts.expectedDirection}`,
    };
  }

  // ── 6. Compute expected signature + constant-time compare ────
  let canonicalBodyBytes: Buffer;
  try {
    canonicalBodyBytes = parseAndCanonicalize(rawBody);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      errorCode: 'invalid_body',
      message: err instanceof Error ? err.message : 'Body is not canonical JSON',
    };
  }

  const bodyHash = createHash('sha256').update(canonicalBodyBytes).digest('hex');
  const signingInput = `${timestampHeader}:${nonceHeader}:${bodyHash}`;
  const expectedSignature = createHmac('sha256', kidEntry.secret)
    .update(signingInput, 'utf-8')
    .digest('hex');

  // Constant-time compare (timingSafeEqual wymaga równych długości buffers)
  let signaturesMatch = false;
  try {
    const providedBuf = Buffer.from(signatureHeader, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (providedBuf.length === expectedBuf.length) {
      signaturesMatch = timingSafeEqual(providedBuf, expectedBuf);
    }
  } catch {
    // invalid hex in signature header
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    return {
      ok: false,
      status: 401,
      errorCode: 'invalid_signature',
      message: 'HMAC signature does not match',
    };
  }

  // ── 7. Anti-replay: atomic nonce insert ──────────────────────
  // INSERT ON CONFLICT DO NOTHING — jeśli nonce już istnieje, powtórzenie
  // wykryte atomowo. Upsert jest jedynym DB round-trip dla valid requesta.
  const db = createSupabaseServiceRole();
  const { error: insertError, data: insertData } = await db
    .from('processing_nonce_store')
    .insert({
      nonce: nonceHeader,
      kid: kidEntry.kid,
    })
    .select('nonce')
    .maybeSingle();

  if (insertError) {
    // Kod 23505 unique_violation = nonce już istnieje = replay
    // (PostgrestError zwraca code jako string)
    if ((insertError as { code?: string }).code === '23505') {
      return {
        ok: false,
        status: 409,
        errorCode: 'replay_detected',
        message: 'Nonce already used within replay window',
      };
    }
    // Inne błędy DB — fail-closed (nie otwieramy gate przy niedostępności nonce store)
    return {
      ok: false,
      status: 500,
      errorCode: 'nonce_store_error',
      message: `Failed to persist nonce: ${insertError.message}`,
    };
  }

  if (!insertData) {
    // Defensive: maybeSingle + insert powinno zwrócić data lub error,
    // ale jeśli obie są null, fail-closed
    return {
      ok: false,
      status: 500,
      errorCode: 'nonce_store_unknown',
      message: 'Nonce insert returned neither data nor error',
    };
  }

  return {
    ok: true,
    kid: kidEntry.kid,
    serviceId: deriveServiceId(kidEntry.kid),
    canonicalBodyBytes,
  };
}
