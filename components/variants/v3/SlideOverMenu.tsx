'use client';

import { useState, useCallback } from 'react';
import { Menu, X, Bookmark, HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import SpiritIcon from '@/app/[locale]/konto/(dashboard)/SpiritIcon';

type MenuItem =
  | { href: string; label: string; spiritIcon: Parameters<typeof SpiritIcon>[0]['type'] }
  | { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const menuItems: MenuItem[] = [
  { href: '/konto', label: 'Nagrania', spiritIcon: 'portal' },
  { href: '/konto/sesje-indywidualne', label: 'Spotkania', spiritIcon: 'eye' },
  { href: '/konto/momenty', label: 'Momenty', icon: Bookmark },
  { href: '/spolecznosc', label: 'Społeczność', spiritIcon: 'vesica' },
  { href: '/konto/wiadomosci', label: 'Wiadomości', spiritIcon: 'feather' },
  { href: '/konto/polubieni', label: 'Znajomi', spiritIcon: 'bond' },
  { href: '/konto/podarowane-sesje', label: 'Podarowane sesje', spiritIcon: 'offering' },
  { href: '/konto/aktualizacja', label: 'Aktualizacja', spiritIcon: 'spiral' },
  { href: '/konto/pytania', label: 'Pytania badawcze', icon: HelpCircle },
];

/**
 * V3 Slide-over menu — full-height panel from left. Used on desktop and mobile.
 */
export default function SlideOverMenu() {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
        aria-label={t('menu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={close}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 z-[61] h-full w-72 bg-htg-card border-r border-htg-card-border shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-htg-card-border">
          <span className="text-sm font-semibold text-htg-fg">Menu</span>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
            aria-label={t('close_menu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 py-6 flex flex-col gap-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={item.href as any}
              onClick={close}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
            >
              {'spiritIcon' in item
                ? <SpiritIcon type={item.spiritIcon} />
                : <item.icon className="w-5 h-5" />}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
