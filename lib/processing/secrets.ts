/**
 * HMAC secret + KID management dla processing service.
 *
 * Dwa kierunki sekretów (plan §2.1, §20.1):
 * - WORKER_TO_HTG2: podpisuje requesty od workera do HTG2 (export,
 *   write-back advisory, reserve-version, jobs/create, consent-fingerprints,
 *   job status callback)
 * - HTG2_TO_WORKER: podpisuje requesty od HTG2 do workera (jobs/start dla
 *   UC1, purge webhook)
 *
 * Każdy kierunek ma osobny pool KID (key identifier) — podczas rotacji
 * istnieją dwa aktywne KID naraz (v1, v2) z 7-dniowym oknem overlap.
 *
 * Env vars format:
 *   PROCESSING_HMAC_W2H_KID      — aktywny KID dla worker→HTG2 (np. 'w2h-v1')
 *   PROCESSING_HMAC_W2H_SECRET   — base64 secret dla tego KID
 *   PROCESSING_HMAC_W2H_PREV_KID — poprzedni KID podczas rotacji (opcjonalny)
 *   PROCESSING_HMAC_W2H_PREV_SECRET
 *   PROCESSING_HMAC_H2W_KID      — aktywny KID dla HTG2→worker
 *   PROCESSING_HMAC_H2W_SECRET
 *   PROCESSING_HMAC_H2W_PREV_KID
 *   PROCESSING_HMAC_H2W_PREV_SECRET
 *
 * Service ID mapping (derived z KID dla audytu):
 *   'w2h-v1' → 'htg-processing-v1'
 *   'w2h-v2' → 'htg-processing-v2'
 *   'h2w-v1' → 'htg2-v1'
 *   ... itd.
 *
 * Patrz: docs/processing-service-plan.md §2.1, §20.1, §20.4
 */

export type HmacDirection = 'worker_to_htg2' | 'htg2_to_worker';

export interface KidEntry {
  kid: string;
  secret: Buffer;
  direction: HmacDirection;
}

/**
 * Resolve KID → secret + direction z env.
 * Zwraca null jeśli KID jest nieznany lub nieaktywny (nie ma w env).
 *
 * Sprawdza oba direction pools (W2H + H2W) — direction jest zwracany
 * razem z secretem, handler może zweryfikować że KID pasuje do
 * oczekiwanego kierunku dla danego endpointu.
 */
export function resolveKid(kid: string): KidEntry | null {
  const envKeys: Array<{ kidVar: string; secretVar: string; direction: HmacDirection }> = [
    { kidVar: 'PROCESSING_HMAC_W2H_KID',      secretVar: 'PROCESSING_HMAC_W2H_SECRET',      direction: 'worker_to_htg2' },
    { kidVar: 'PROCESSING_HMAC_W2H_PREV_KID', secretVar: 'PROCESSING_HMAC_W2H_PREV_SECRET', direction: 'worker_to_htg2' },
    { kidVar: 'PROCESSING_HMAC_H2W_KID',      secretVar: 'PROCESSING_HMAC_H2W_SECRET',      direction: 'htg2_to_worker' },
    { kidVar: 'PROCESSING_HMAC_H2W_PREV_KID', secretVar: 'PROCESSING_HMAC_H2W_PREV_SECRET', direction: 'htg2_to_worker' },
  ];

  for (const { kidVar, secretVar, direction } of envKeys) {
    const envKid = process.env[kidVar];
    const envSecret = process.env[secretVar];
    if (envKid && envSecret && envKid === kid) {
      return {
        kid,
        secret: Buffer.from(envSecret, 'base64'),
        direction,
      };
    }
  }

  return null;
}

/**
 * Derive stable service_id z KID dla audit logs + processing_export_subjects.
 *
 * Mapping:
 *   w2h-v1 → htg-processing-v1
 *   w2h-v2 → htg-processing-v2
 *   h2w-v1 → htg2-v1
 *   h2w-v2 → htg2-v2
 *
 * Stabilny identyfikator — rotacja KID w tym samym kierunku zmienia
 * numer wersji (v1 → v2) ale mapping pozostaje deterministyczny.
 */
export function deriveServiceId(kid: string): string {
  const match = kid.match(/^(w2h|h2w)-(.+)$/);
  if (!match) {
    throw new Error(`Invalid KID format: ${kid} (expected 'w2h-*' or 'h2w-*')`);
  }
  const [, direction, version] = match;
  const prefix = direction === 'w2h' ? 'htg-processing' : 'htg2';
  return `${prefix}-${version}`;
}
