import { getRequestConfig } from 'next-intl/server';
import { routing } from './i18n-config';
import { hasLocale } from 'next-intl';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  let messages = {};
  try {
    messages = (await import(`./messages/${locale}.json`)).default;
  } catch {
    // Fallback — brak tłumaczeń dla tego locale
    messages = (await import(`./messages/pl.json`)).default;
  }

  return {
    locale,
    messages
  };
});
