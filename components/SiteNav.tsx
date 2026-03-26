'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n-config';
import { Menu, X } from 'lucide-react';
import LocaleSwitcher from './LocaleSwitcher';
import ThemeToggle from './ThemeToggle';

const navLinks = [
  { href: '/sesje', key: 'sessions' },
  { href: '/sesje-indywidualne', key: 'individual' },
  { href: '/subskrypcje', key: 'subscriptions' },
  { href: '/nagrania', key: 'recordings' },
] as const;

export default function SiteNav({ isLoggedIn = false, isAdmin = false, isStaff = false }: { isLoggedIn?: boolean; isAdmin?: boolean; isStaff?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <nav aria-label="Nawigacja główna">
      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-6">
        {navLinks.map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            className={`text-sm font-medium transition-colors hover:text-htg-indigo ${
              pathname.startsWith(href)
                ? 'text-htg-indigo border-b-2 border-htg-sage pb-0.5'
                : 'text-htg-fg-muted'
            }`}
          >
            {t(key)}
          </Link>
        ))}
        {isLoggedIn && (
          <Link
            href="/konto"
            className={`text-sm font-medium transition-colors hover:text-htg-indigo ${
              pathname.startsWith('/konto')
                ? 'text-htg-indigo border-b-2 border-htg-sage pb-0.5'
                : 'text-htg-fg-muted'
            }`}
          >
            {t('account')}
          </Link>
        )}
        {isStaff && (
          <Link
            href="/prowadzacy"
            className={`text-sm font-medium transition-colors hover:text-htg-indigo ${
              pathname.startsWith('/prowadzacy')
                ? 'text-htg-indigo border-b-2 border-htg-sage pb-0.5'
                : 'text-htg-fg-muted'
            }`}
          >
            {t('staff')}
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/admin"
            className={`text-sm font-medium transition-colors hover:text-htg-indigo ${
              pathname.startsWith('/admin')
                ? 'text-htg-indigo border-b-2 border-htg-sage pb-0.5'
                : 'text-htg-fg-muted'
            }`}
          >
            Admin
          </Link>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden p-2 rounded-lg hover:bg-htg-surface"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Zamknij menu' : 'Otwórz menu'}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile menu overlay */}
      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-htg-card border-b border-htg-card-border shadow-lg z-40">
          <div className="flex flex-col p-4 gap-2">
            {navLinks.map(({ href, key }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-htg-surface text-htg-indigo'
                    : 'text-htg-fg hover:bg-htg-surface'
                }`}
              >
                {t(key)}
              </Link>
            ))}
            {isLoggedIn && (
              <Link
                href="/konto"
                onClick={() => setOpen(false)}
                className={`py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                  pathname.startsWith('/konto')
                    ? 'bg-htg-surface text-htg-indigo'
                    : 'text-htg-fg hover:bg-htg-surface'
                }`}
              >
                {t('account')}
              </Link>
            )}
            {isStaff && (
              <Link
                href="/prowadzacy"
                onClick={() => setOpen(false)}
                className={`py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                  pathname.startsWith('/prowadzacy')
                    ? 'bg-htg-surface text-htg-indigo'
                    : 'text-htg-fg hover:bg-htg-surface'
                }`}
              >
                {t('staff')}
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={`py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                  pathname.startsWith('/admin')
                    ? 'bg-htg-surface text-htg-indigo'
                    : 'text-htg-fg hover:bg-htg-surface'
                }`}
              >
                Admin
              </Link>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-htg-card-border mt-2">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
