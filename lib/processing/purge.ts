/**
 * Webhook purge sender: HTG2 → processing service worker.
 *
 * Wysyła scope-specific purge webhook gdy:
 * - Klient wycofuje sensitive_data consent → purge WSZYSTKICH Dossier usera
 * - Klient wycofuje session_recording_capture dla konkretnego bookingu → purge
 *   Dossier których bookings_used[] zawiera ten booking
 * - User soft-deleted → purge wszystkiego + usunięcie z processing_export_subjects
 * - client_recordings soft-deleted → purge Dossier z powiązanym bookingiem
 *
 * Webhook jest HMAC-signed z kluczem HMAC_SECRET_HTG2_TO_WORKER (kierunek h2w).
 * Worker weryfikuje podpis po swojej stronie.
 *
 * Fire-and-forget z retry: failure logowany, NIE blokuje caller (consent
 * wycofanie nie może się nie udać bo webhook nie doszedł). Worker reconcile
 * (nightly) wyłapie drift.
 *
 * Patrz: docs/processing-service-plan.md §9, §11 (purge webhook per scope)
 */

import { createHash, createHmac, randomUUID } from 'crypto';
import { canonicalBody } from './canonical-body';

export type PurgeEventType =
  | 'sensitive_data_change'
  | 'capture_change'
  | 'user_soft_delete'
  | 'recording_soft_delete';

export interface PurgePayload {
  event: PurgeEventType;
  user_id: string;
  booking_id?: string;   // dla capture_change i recording_soft_delete
  timestamp: string;     // ISO 8601
}

/**
 * Send purge webhook do processing service worker.
 *
 * Fire-and-forget z max 2 retry (1s, 3s backoff). Failure logowany
 * ale NIE rzuca exception — caller kontynuuje normalne.
 *
 * @returns true jeśli webhook doszedł (2xx), false jeśli nie
 */
export async function sendPurgeWebhook(payload: PurgePayload): Promise<boolean> {
  const workerPurgeUrl = process.env.PROCESSING_WORKER_PURGE_URL;
  if (!workerPurgeUrl) {
    console.warn('[purge-webhook] PROCESSING_WORKER_PURGE_URL not configured — skipping');
    return false;
  }

  const h2wKid = process.env.PROCESSING_HMAC_H2W_KID;
  const h2wSecret = process.env.PROCESSING_HMAC_H2W_SECRET;
  if (!h2wKid || !h2wSecret) {
    console.warn('[purge-webhook] H2W HMAC keys not configured — skipping');
    return false;
  }

  const bodyBytes = canonicalBody(payload);
  const bodyString = bodyBytes.toString('utf-8');
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex');
  const signingInput = `${timestamp}:${nonce}:${bodyHash}`;
  const signature = createHmac('sha256', Buffer.from(h2wSecret, 'base64'))
    .update(signingInput, 'utf-8')
    .digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Processing-Timestamp': timestamp,
    'X-Processing-Nonce': nonce,
    'X-Processing-Signature': signature,
    'X-Processing-Key-Id': h2wKid,
  };

  const backoffs = [0, 1000, 3000]; // immediate, 1s, 3s

  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt] > 0) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }

    try {
      const resp = await fetch(workerPurgeUrl, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (resp.ok) {
        return true;
      }

      console.warn(
        `[purge-webhook] attempt ${attempt + 1}/${backoffs.length} failed: ${resp.status} ${resp.statusText}`,
        payload,
      );
    } catch (err) {
      console.warn(
        `[purge-webhook] attempt ${attempt + 1}/${backoffs.length} exception:`,
        err instanceof Error ? err.message : err,
        payload,
      );
    }
  }

  console.error('[purge-webhook] all retries exhausted', payload);
  return false;
}
