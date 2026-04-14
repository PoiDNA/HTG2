'use client';

import { Link, usePathname } from '@/i18n-config';
import { Library, CalendarDays, MessagesSquare } from 'lucide-react';

const navLinks = [
  { href: '/konto', label: 'Nagrania', icon: Library },
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
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? 'text-htg-fg'
                : 'text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
