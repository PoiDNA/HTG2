'use client';

import { Link, usePathname } from '@/i18n-config';
import { useTranslations } from 'next-intl';
import { Film, CalendarDays, MessagesSquare } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/konto', labelKey: 'recordings', icon: Film },
  { href: '/konto/sesje-indywidualne', labelKey: 'individual', icon: CalendarDays },
  { href: '/spolecznosc', labelKey: 'community', icon: MessagesSquare },
] as const;

/**
 * V3 NavLinks — icon-only with tooltips. Minimal, sharp.
 */
export default function NavLinksV3() {
  const pathname = usePathname();
  const t = useTranslations('Nav');

  return (
    <div className="hidden md:flex items-center justify-center gap-1">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const isActive = href === '/konto'
          ? pathname.endsWith('/konto')
          : pathname.includes(href);

        return (
          <Link
            key={href}
            href={href}
            title={t(labelKey)}
            className={`relative p-2 rounded-lg transition-colors ${
              isActive
                ? 'text-htg-fg bg-htg-surface'
                : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
            }`}
          >
            <Icon className="w-5 h-5" />
          </Link>
        );
      })}
    </div>
  );
}
