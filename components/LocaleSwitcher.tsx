'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n-config';
import { locales } from '@/i18n-config';

const localeLabels: Record<string, string> = {
  pl: 'PL',
  en: 'EN',
};

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => router.replace(pathname, { locale: l })}
          className={`px-2 py-1 text-sm rounded transition-colors ${
            l === locale
              ? 'bg-htg-indigo text-white font-semibold'
              : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
          }`}
          aria-label={`Zmień język na ${localeLabels[l]}`}
        >
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}
