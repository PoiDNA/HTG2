'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n-config';
import { locales } from '@/i18n-config';

const localeLabels: Record<string, string> = {
  pl: 'PL',
  en: 'EN',
  de: 'DE',
  pt: 'PT',
};

/** Locales visible in the switcher */
const VISIBLE_LOCALES: readonly string[] = ['pl', 'en', 'de', 'pt'];

interface LocaleSwitcherProps {
  /** Override which locales are shown (default: VISIBLE_LOCALES) */
  showLocales?: readonly string[];
}

export default function LocaleSwitcher({ showLocales = VISIBLE_LOCALES }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Nav');

  function handleSwitch(targetLocale: string) {
    // Store in localStorage for auth callback redirect
    try { localStorage.setItem('htg-locale', targetLocale); } catch {}

    router.replace(pathname, { locale: targetLocale });

    // Persist preference to server (best-effort)
    fetch('/api/profile/locale', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: targetLocale }),
    }).catch(() => {});
  }

  return (
    <div className="flex items-center gap-1">
      {locales
        .filter((l) => showLocales.includes(l))
        .map((l) => (
          <button
            key={l}
            onClick={() => handleSwitch(l)}
            className={`px-2 py-1 text-sm rounded transition-colors ${
              l === locale
                ? 'bg-htg-indigo text-white font-semibold'
                : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
            }`}
            aria-label={t('switch_locale', { locale: localeLabels[l] })}
          >
            {localeLabels[l]}
          </button>
        ))}
    </div>
  );
}
