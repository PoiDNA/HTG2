'use client';

import { Link, usePathname } from '@/i18n-config';
import { useTranslations } from 'next-intl';
import { useUserRole } from '@/lib/useUserRole';

const navLinks = [
  { href: '/sesje', key: 'sessions' },
  { href: '/sesje-indywidualne', key: 'individual' },
  { href: '/nagrania', key: 'recordings' },
] as const;

export default function NavLinks() {
  const t = useTranslations('Nav');
  const pathname = usePathname();
  const { isLoggedIn, loading } = useUserRole();

  // Hide nav links when logged in or while auth state is loading
  if (loading || isLoggedIn) return <div />;

  return (
    <div className="hidden md:flex items-center justify-center gap-1">
      {navLinks.map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            pathname.startsWith(href)
              ? 'text-htg-fg opacity-100'
              : 'text-htg-fg opacity-25 hover:opacity-100'
          }`}
        >
          {t(key)}
        </Link>
      ))}
    </div>
  );
}
