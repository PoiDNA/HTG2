'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Menu, X, LogOut, Users2 } from 'lucide-react'; // Users2 kept for mobile menu
import ThemeToggle from './ThemeToggle';
import FontSizeToggle from './FontSizeToggle';
import HeaderAuthButton from './HeaderAuthButton';
import UserPanelNav from './UserPanelNav';
import { NotificationBell } from './community/NotificationBell';

const navLinks = [
  { href: '/sesje', key: 'sessions' },
  { href: '/sesje-indywidualne', key: 'individual' },
  { href: '/nagrania', key: 'recordings' },
] as const;

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Nav');
  const tPanel = useTranslations('PanelNav');
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoggedIn, isAdmin, isStaff, loading } = useUserRole();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
    setOpen(false);
  }

  const isCommunityActive = pathname.startsWith('/spolecznosc');

  return (
    <nav aria-label="Nawigacja główna">
      {/* Desktop: FontSize + Theme + Notifications + Auth — po prawej */}
      <div className="hidden md:flex items-center gap-2">
        <FontSizeToggle />
        <ThemeToggle />
        {!loading && isLoggedIn && (
          <>
            <GhostNavLink href="/nagrania" label="Na początek" pathname={pathname} />
            <GhostNavLink href="/sesje-indywidualne" label="Umów sesję" pathname={pathname} />
            <GhostNavLink href="/konto" label="Biblioteka" pathname={pathname} />
          </>
        )}
        {!loading && isLoggedIn && user && <NotificationBell userId={user.id} alwaysShow={isCommunityActive} />}
        {!loading && isLoggedIn ? <UserPanelNav /> : <HeaderAuthButton />}
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
          <div className="flex flex-col p-4 gap-1">
            {/* Main navigation */}
            <MobileLink href="/sesje" label="Biblioteka sesji" pathname={pathname} onClick={() => setOpen(false)} />
            <MobileLink href="/sesje-indywidualne" label="Sesje z Natalią" pathname={pathname} onClick={() => setOpen(false)} />
            <MobileLink href="/spolecznosc" label="Społeczność" pathname={pathname} onClick={() => setOpen(false)} />
            <MobileLink href="/wiadomosci" label="Centrum Kontaktu" pathname={pathname} onClick={() => setOpen(false)} />

            {/* User section */}
            {isLoggedIn && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <MobileLink href="/konto/subskrypcje" label="Twoje Aktywacje" pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/polubieni" label="Twoi Znajomi" pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/podarowane-sesje" label="Podarowane sesje" pathname={pathname} onClick={() => setOpen(false)} />

                <div className="border-t border-htg-card-border my-2" />
                <MobileLink href="/konto/aktualizacja" label="Aktualizacja" pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/spotkania-htg" label="Spotkania" pathname={pathname} onClick={() => setOpen(false)} />
              </>
            )}

            {/* Staff section */}
            {isStaff && !isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{tPanel('staff_panel')}</p>
                <MobileLink href="/prowadzacy" label={tPanel('staff_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/grafik" label={tPanel('staff_schedule')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/sesje" label={tPanel('staff_sessions')} pathname={pathname} onClick={() => setOpen(false)} />
              </>
            )}

            {/* Admin section */}
            {isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">Admin</p>
                <MobileLink href="/konto/admin" label={tPanel('admin_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/admin/kalendarz" label={tPanel('admin_calendar')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/admin/kolejka" label={tPanel('admin_queue')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/admin/sloty" label={tPanel('admin_slots')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/konto/admin/uzytkownicy" label={tPanel('admin_users')} pathname={pathname} onClick={() => setOpen(false)} />
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">{tPanel('staff_panel')}</p>
                <MobileLink href="/prowadzacy" label={tPanel('staff_panel')} pathname={pathname} onClick={() => setOpen(false)} />
                <MobileLink href="/prowadzacy/grafik" label={tPanel('staff_schedule')} pathname={pathname} onClick={() => setOpen(false)} />
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

            <div className="flex items-center gap-3 pt-2 border-t border-htg-card-border mt-2">
              <FontSizeToggle />
              <ThemeToggle />
              {!loading && (
                isLoggedIn ? (
                  <button
                    onClick={handleLogout}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-500 hover:bg-htg-surface transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {tPanel('logout')}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-htg-indigo hover:bg-htg-surface transition-colors"
                  >
                    Zaloguj
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function GhostNavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        isActive
          ? 'text-htg-fg opacity-100'
          : 'text-htg-fg opacity-25 hover:opacity-100'
      }`}
    >
      {label}
    </Link>
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
