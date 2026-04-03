/**
 * Hostname detection for the nagrania.htg.cyou standalone portal.
 */

export function isNagraniaPortal(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(':')[0]; // strip port for localhost dev
  return h === 'nagrania.htg.cyou' || h === 'nagrania.localhost';
}

export const NAGRANIA_HOME = '/konto/nagrania-sesji';
