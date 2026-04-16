/**
 * Pick the best available string from a JSONB i18n column.
 * Falls back to 'pl', then to the provided fallback string.
 */
export function pickLocale(
  i18n: Record<string, string> | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!i18n) return fallback;
  return i18n[locale] || i18n['pl'] || fallback;
}
