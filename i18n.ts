import { getRequestConfig } from 'next-intl/server';
import { routing } from './i18n-config';
import { hasLocale } from 'next-intl';
import plMessages from './messages/pl.json';

/**
 * Deep-merge base (PL) messages with locale-specific overrides.
 * Ensures missing keys in DE/PT/EN fall back to Polish automatically.
 * Works for both RSC and client (NextIntlClientProvider receives merged result).
 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      );
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  let messages: Record<string, unknown>;
  if (locale === 'pl') {
    messages = plMessages;
  } else {
    try {
      const localeMessages = (await import(`./messages/${locale}.json`)).default;
      messages = deepMerge(plMessages as Record<string, unknown>, localeMessages);
    } catch {
      messages = plMessages;
    }
  }

  return {
    locale,
    messages
  };
});
