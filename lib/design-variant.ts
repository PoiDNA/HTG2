import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export const DESIGN_VARIANT_COOKIE = 'htg_design_variant';

export type DesignVariant = 'v1' | 'v2' | 'v3';

const VALID_VARIANTS: ReadonlySet<string> = new Set<DesignVariant>(['v1', 'v2', 'v3']);

export const DEFAULT_VARIANT: DesignVariant = 'v1';

export function getDesignVariant(cookieStore: ReadonlyRequestCookies): DesignVariant {
  const raw = cookieStore.get(DESIGN_VARIANT_COOKIE)?.value;
  if (raw && VALID_VARIANTS.has(raw)) return raw as DesignVariant;
  return DEFAULT_VARIANT;
}
