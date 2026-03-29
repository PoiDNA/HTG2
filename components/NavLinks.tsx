'use client';

import { Link, usePathname } from '@/i18n-config';
import { useTranslations } from 'next-intl';

const navLinks = [
  { href: '/sesje', key: 'sessions' },
  { href: '/sesje-indywidualne', key: 'individual' },
  { href: '/nagrania', key: 'recordings' },
] as const;

export default function NavLinks() {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center justify-center gap-5">
      {navLinks.map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm font-medium transition-colors hover:text-htg-indigo ${
            pathname.startsWith(href) ? 'text-htg-indigo' : 'text-htg-fg-muted'
          }`}
        >
          {t(key)}
        </Link>
      ))}
    </div>
  );
}
