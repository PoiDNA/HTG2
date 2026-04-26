/**
 * Hostname detection for standalone portals:
 *   nagrania.htg.cyou — recordings portal
 *   sesja.htg.cyou    — session portal (simplified view for clients)
 */

// ─── Nagrania portal ──────────────────────────────────────────

export function isNagraniaPortal(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(':')[0]; // strip port for localhost dev
  return h === 'nagrania.htg.cyou' || h === 'nagrania.localhost';
}

export const NAGRANIA_HOME = '/konto/nagrania-sesji';

// ─── Sesja portal ─────────────────────────────────────────────

export function isSesjaPortal(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(':')[0];
  return h === 'sesja.htg.cyou' || h === 'sesja.localhost';
}

export const SESJA_HOME = '/konto/sesja-panel';

// ─── Sesje portal (zarządzanie sesjami przez staff) ───────────

export function isSesjePortal(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(':')[0];
  return h === 'sesje.htg.cyou' || h === 'sesje.localhost';
}

export const SESJE_HOME = '/konto/admin/sesje';

// ─── Helpers ──────────────────────────────────────────────────

export function isAnyPortal(host: string | null): boolean {
  return isNagraniaPortal(host) || isSesjaPortal(host) || isSesjePortal(host);
}

/** Server-side: returns the portal home path based on hostname */
export function getPortalHome(host: string | null): string {
  if (isNagraniaPortal(host)) return NAGRANIA_HOME;
  if (isSesjaPortal(host)) return SESJA_HOME;
  if (isSesjePortal(host)) return SESJE_HOME;
  return '/konto';
}

/** Client-side: reads hostname from window (safe in SSR — returns '/konto' on server) */
export function getPortalHomeClient(): string {
  if (typeof window === 'undefined') return '/konto';
  return getPortalHome(window.location.hostname);
}

/** Client-side: checks if running on any portal */
export function isAnyPortalClient(): boolean {
  if (typeof window === 'undefined') return false;
  return isAnyPortal(window.location.hostname);
}

// ─── Pilot site (public corporate page, not a konto portal) ──

export function isPilotSite(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(':')[0];
  return h === 'pilot.place' || h === 'www.pilot.place' || h === 'pilot.localhost';
}

export const PILOT_HOME = '/pilot';
