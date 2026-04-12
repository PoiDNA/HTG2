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
 * Unified top navigation — visible for all users (logged in and out).
 * Icons + text, active = dot indicator underneath.
 */
export default function NavLinks() {
  const pathname = usePathname();
  const t = useTranslations('Nav');

  return (
    <div className="hidden md:flex items-center justify-center gap-1">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const isActive = href === '/konto'
          ? pathname.endsWith('/konto') || (pathname.includes('/konto/') && !pathname.includes('/sesje-indywidualne'))
          : pathname.includes(href);

        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'text-htg-fg'
                : 'text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(labelKey)}
            {isActive && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-htg-indigo" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
