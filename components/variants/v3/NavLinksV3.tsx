'use client';

import { Link, usePathname } from '@/i18n-config';
import { Film, CalendarDays, MessagesSquare } from 'lucide-react';

const navLinks = [
  { href: '/konto', label: 'Nagrania', icon: Film },
  { href: '/konto/sesje-indywidualne', label: 'Spotkania', icon: CalendarDays },
  { href: '/spolecznosc', label: 'Społeczność', icon: MessagesSquare },
] as const;

/**
 * V3 NavLinks — icon-only with tooltips. Minimal, sharp.
 */
export default function NavLinksV3() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center justify-center gap-1">
      {navLinks.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/konto'
          ? pathname.endsWith('/konto')
          : pathname.includes(href);

        return (
          <Link
            key={href}
            href={href}
            title={label}
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
