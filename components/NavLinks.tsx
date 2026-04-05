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
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${
            pathname.startsWith(href)
              ? 'bg-htg-fg/10 text-htg-fg border-htg-fg/20'
              : 'text-htg-fg/30 border-transparent hover:text-htg-fg/80 hover:bg-htg-fg/5 hover:border-htg-fg/10'
          }`}
        >
          {t(key)}
        </Link>
      ))}
    </div>
  );
}
