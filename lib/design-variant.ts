import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { isAdminEmail } from '@/lib/roles';

export const DESIGN_VARIANT_COOKIE = 'htg_design_variant';

export type DesignVariant = 'v1' | 'v2' | 'v3';

const VALID_VARIANTS: ReadonlySet<string> = new Set<DesignVariant>(['v1', 'v2', 'v3']);

export const DEFAULT_VARIANT: DesignVariant = 'v1';

/** Extra emails allowed to see the design variant switcher (non-admin testers). */
const VARIANT_TESTER_EMAILS: ReadonlySet<string> = new Set([
  'przemekbcs@gmail.com',
]);

/** Check if the given email can switch design variants (admin OR tester). */
export function canSwitchVariant(email: string): boolean {
  const lower = email.toLowerCase();
  return isAdminEmail(lower) || VARIANT_TESTER_EMAILS.has(lower);
}

export function getDesignVariant(cookieStore: ReadonlyRequestCookies): DesignVariant {
  const raw = cookieStore.get(DESIGN_VARIANT_COOKIE)?.value;
  if (raw && VALID_VARIANTS.has(raw)) return raw as DesignVariant;
  return DEFAULT_VARIANT;
}
