'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Menu, X, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import UserPanelNav from './UserPanelNav';

const navLinks = [
  { href: '/sesje', key: 'sessions' },
  { href: '/sesje-indywidualne', key: 'individual' },
  { href: '/subskrypcje', key: 'subscriptions' },
  { href: '/nagrania', key: 'recordings' },
] as const;

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Nav');
  const tPanel = useTranslations('PanelNav');
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, isAdmin, isStaff, loading } = useUserRole();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
    setOpen(false);
  }

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
        {/* Show UserPanelNav dropdown when logged in */}
        {!loading && isLoggedIn && <UserPanelNav />}
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

            {/* Staff: show staff panel first, then profile only */}
            {isStaff && !isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{tPanel('staff_panel')}</p>
                <MobileLink href="/prowadzacy" label={tPanel('staff_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/grafik" label={tPanel('staff_schedule')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/sesje" label={tPanel('staff_sessions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/subskrypcje" label={tPanel('my_subscriptions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/profil" label={tPanel('profile')} pathname={pathname} onClick={() => setOpen(false)} />
              </>
            )}

            {/* Regular user: full user menu */}
            {isLoggedIn && !isStaff && !isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{t('account')}</p>
                <MobileLink href="/konto" label={tPanel('my_sessions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/sesje-indywidualne" label={tPanel('individual_sessions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/subskrypcje" label={tPanel('my_subscriptions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/zamowienia" label={tPanel('orders')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/profil" label={tPanel('profile')} pathname={pathname} onClick={() => setOpen(false)} />
              </>
            )}

            {/* Admin: all sections */}
            {isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">Admin</p>
                <MobileLink href="/admin" label={tPanel('admin_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/admin/kalendarz" label={tPanel('admin_calendar')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/admin/kolejka" label={tPanel('admin_queue')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/admin/sloty" label={tPanel('admin_slots')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/admin/uzytkownicy" label={tPanel('admin_users')} pathname={pathname} onClick={() => setOpen(false)} />
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{tPanel('staff_panel')}</p>
                <MobileLink href="/prowadzacy" label={tPanel('staff_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/grafik" label={tPanel('staff_schedule')} pathname={pathname} onClick={() => setOpen(false)} />
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{t('account')}</p>
                <MobileLink href="/konto" label={tPanel('my_sessions')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/profil" label={tPanel('profile')} pathname={pathname} onClick={() => setOpen(false)} />
              </>
            )}

            {isLoggedIn && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <button
                  onClick={handleLogout}
                  className="py-3 px-4 rounded-lg text-base font-medium text-red-600 dark:text-red-400 hover:bg-htg-surface transition-colors text-left flex items-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  {tPanel('logout')}
                </button>
              </>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-htg-card-border mt-2">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileLink({ href, label, pathname, onClick }: { href: string; label: string; pathname: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
        pathname === href
          ? 'bg-htg-surface text-htg-indigo'
          : 'text-htg-fg hover:bg-htg-surface'
      }`}
    >
      {label}
    </Link>
  );
}
