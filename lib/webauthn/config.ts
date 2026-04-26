export const rpName = process.env.WEBAUTHN_RP_NAME || 'HTG';

/**
 * Derive WebAuthn RP ID from the request host.
 *
 * WebAuthn requires the RP ID to be the "effective domain" of the origin.
 * - *.htg.cyou subdomains (nagrania, sesja, planer) → RP ID = "htg.cyou"
 *   Passkeys registered on any *.htg.cyou subdomain work across all of them.
 * - htgcyou.com (main app) → WEBAUTHN_RP_ID env var (default "htgcyou.com")
 * - localhost / other → WEBAUTHN_RP_ID env var fallback
 */
export function getRpIDForHost(host: string | null | undefined): string {
  const h = (host ?? '').split(':')[0].toLowerCase();
  if (h === 'htg.cyou' || h.endsWith('.htg.cyou')) return 'htg.cyou';
  const envRpId = process.env.WEBAUTHN_RP_ID;
  if (!envRpId) throw new Error('Missing required env var: WEBAUTHN_RP_ID');
  return envRpId;
}

/**
 * Derive WebAuthn expected origin from the request host.
 * Always https in production; falls back to env var for localhost.
 */
export function getOriginForHost(host: string | null | undefined): string {
  const h = (host ?? '').split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') {
    const envOrigin = process.env.WEBAUTHN_ORIGIN;
    if (envOrigin) return envOrigin;
    return `http://${host ?? 'localhost:3000'}`;
  }
  return `https://${h}`;
}

// Legacy single-value exports kept for backward compatibility
export function getRpID(): string {
  const v = process.env.WEBAUTHN_RP_ID;
  if (!v) throw new Error('Missing required env var: WEBAUTHN_RP_ID');
  return v;
}

export function getOrigin(): string {
  const v = process.env.WEBAUTHN_ORIGIN;
  if (!v) throw new Error('Missing required env var: WEBAUTHN_ORIGIN');
  return v;
}
