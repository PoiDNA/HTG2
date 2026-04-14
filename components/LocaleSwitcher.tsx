'use client';

import { useRef, useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { ChevronDown } from 'lucide-react';

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleSwitch(targetLocale: string) {
    // Store in localStorage for auth callback redirect
    try { localStorage.setItem('htg-locale', targetLocale); } catch {}

    // next-intl preserves current params when switching locale via usePathname()
    router.replace(pathname as any, { locale: targetLocale });

    // Persist preference to server (best-effort)
    fetch('/api/profile/locale', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: targetLocale }),
    }).catch(() => {});

    setOpen(false);
  }

  const visible = locales.filter((l) => showLocales.includes(l));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          open
            ? 'bg-htg-surface text-htg-fg'
            : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
        }`}
        aria-label="Zmień język"
        aria-expanded={open}
      >
        <span>{localeLabels[locale] ?? locale.toUpperCase()}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-20 bg-htg-card border border-htg-card-border rounded-xl shadow-xl py-1 z-50">
          {visible.map((l) => (
            <button
              key={l}
              onClick={() => handleSwitch(l)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                l === locale
                  ? 'text-htg-fg font-semibold bg-htg-surface'
                  : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
              }`}
            >
              {localeLabels[l] ?? l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
