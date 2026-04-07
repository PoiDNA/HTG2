'use client';

import { Link, usePathname } from '@/i18n-config';
import { Film, CalendarDays, MessagesSquare } from 'lucide-react';

const navLinks = [
  { href: '/konto', label: 'Nagrania', icon: Film },
  { href: '/konto/sesje-indywidualne', label: 'Spotkania', icon: CalendarDays },
  { href: '/spolecznosc', label: 'Społeczność', icon: MessagesSquare },
] as const;

/**
 * V2 NavLinks — visible for logged-in users too.
 * Clear, calm navigation with text labels + active dot indicator.
 */
export default function NavLinksV2() {
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
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'text-htg-fg'
                : 'text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {isActive && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-htg-indigo" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
