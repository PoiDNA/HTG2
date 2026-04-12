/**
 * Shared formatting utilities for locale-aware dates, prices, and numbers.
 * Used across components to replace hardcoded 'pl-PL' / 'PLN' formatting.
 */

const INTL_LOCALE: Record<string, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  de: 'de-DE',
  pt: 'pt-PT',
};

/**
 * Format a price in the smallest currency unit (grosz/cent) to a human-readable string.
 * @param amountCents - Amount in smallest unit (e.g. 12000 = 120 PLN)
 * @param currency - ISO 4217 currency code (e.g. 'pln', 'eur', 'usd')
 * @param locale - App locale key (e.g. 'pl', 'en', 'de', 'pt')
 */
export function formatPrice(amountCents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale] || locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

/**
 * Format a date string or Date object using the user's locale.
 * @param date - ISO date string or Date object
 * @param locale - App locale key
 * @param options - Intl.DateTimeFormat options (defaults to long date)
 */
export function formatDate(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(
    INTL_LOCALE[locale] || locale,
    options ?? { year: 'numeric', month: 'long', day: 'numeric' }
  );
}

/**
 * Format a date with time.
 */
export function formatDateTime(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(
    INTL_LOCALE[locale] || locale,
    options ?? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  );
}

/**
 * Get the Intl locale string for a given app locale.
 */
export function getIntlLocale(locale: string): string {
  return INTL_LOCALE[locale] || locale;
}
