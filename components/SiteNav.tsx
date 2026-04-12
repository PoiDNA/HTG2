'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Menu, X, LogOut, CalendarDays, Users, Gift, RefreshCw, Mail, User } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import FontSizeToggle from './FontSizeToggle';
import HeaderAuthButton from './HeaderAuthButton';
import { NotificationBell } from './community/NotificationBell';
import LocaleSwitcher from './LocaleSwitcher';

const menuItems = [
  { href: '/konto/sesje-indywidualne', label: 'Umów Sesję', icon: CalendarDays },
  { href: '/konto/polubieni', label: 'Twoi Znajomi', icon: Users },
  { href: '/konto/podarowane-sesje', label: 'Podarowane Sesje', icon: Gift },
  { href: '/konto/aktualizacja', label: 'Aktualizacja', icon: RefreshCw },
  { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', icon: Mail },
] as const;

export default function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tPanel = useTranslations('PanelNav');
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoggedIn, isAdmin, isStaff, loading } = useUserRole();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
    setMenuOpen(false);
    setMobileOpen(false);
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const isCommunityActive = pathname.startsWith('/spolecznosc');

  return (
    <nav aria-label="Nawigacja główna">
      {/* Desktop */}
      <div className="hidden md:flex items-center gap-2">
        <LocaleSwitcher />
        <FontSizeToggle />
        <ThemeToggle />
        {!loading && isLoggedIn && user && <NotificationBell userId={user.id} alwaysShow={isCommunityActive} />}

        {/* MENU dropdown (logged in) — contains user email, menu items, logout */}
        {!loading && isLoggedIn && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                menuOpen
                  ? 'bg-htg-surface text-htg-fg'
                  : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
              }`}
            >
              Menu
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-htg-card border border-htg-card-border rounded-xl shadow-xl py-2 z-50">
                {/* User email */}
                <div className="px-4 py-2.5 border-b border-htg-card-border mb-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-htg-fg-muted shrink-0" />
                    <span className="text-sm text-htg-fg truncate">{user?.email}</span>
                  </div>
                </div>

                {/* Menu items */}
                {menuItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                      pathname.includes(href)
                        ? 'text-htg-fg bg-htg-surface'
                        : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                ))}

                {/* Admin/Staff links */}
                {(isAdmin || isStaff) && (
                  <>
                    <div className="border-t border-htg-card-border my-1.5" />
                    {isAdmin && (
                      <Link href="/konto/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface">
                        Admin
                      </Link>
                    )}
                    {isStaff && !isAdmin && (
                      <Link href="/prowadzacy" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface">
                        Panel prowadzącego
                      </Link>
                    )}
                  </>
                )}

                {/* Logout */}
                <div className="border-t border-htg-card-border my-1.5" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-htg-surface transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Wyloguj
                </button>
              </div>
            )}
          </div>
        )}

        {/* Auth button (logged out only) */}
        {!loading && !isLoggedIn && <HeaderAuthButton />}
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden p-2 rounded-lg hover:bg-htg-surface"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Zamknij menu' : 'Otwórz menu'}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-htg-card border-b border-htg-card-border shadow-lg z-40">
          <div className="flex flex-col p-4 gap-1">
            {/* User email */}
            {isLoggedIn && user?.email && (
              <div className="px-4 py-2 mb-1 text-sm text-htg-fg-muted truncate border-b border-htg-card-border pb-3">
                {user.email}
              </div>
            )}

            {/* Main nav */}
            <MobileLink href="/konto" label="Nagrania" pathname={pathname} onClick={() => setMobileOpen(false)} />
            <MobileLink href="/konto/sesje-indywidualne" label="Spotkania" pathname={pathname} onClick={() => setMobileOpen(false)} />
            <MobileLink href="/spolecznosc" label="Społeczność" pathname={pathname} onClick={() => setMobileOpen(false)} />

            {/* Menu items */}
            {isLoggedIn && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                {menuItems.map(({ href, label }) => (
                  <MobileLink key={href} href={href} label={label} pathname={pathname} onClick={() => setMobileOpen(false)} />
                ))}
              </>
            )}

            {/* Admin/Staff */}
            {isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <p className="px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider">Admin</p>
                <MobileLink href="/konto/admin" label={tPanel('admin_panel')} pathname={pathname} onClick={() => setMobileOpen(false)} />
                <MobileLink href="/konto/admin/kalendarz" label={tPanel('admin_calendar')} pathname={pathname} onClick={() => setMobileOpen(false)} />
                <MobileLink href="/konto/admin/uzytkownicy" label={tPanel('admin_users')} pathname={pathname} onClick={() => setMobileOpen(false)} />
              </>
            )}
            {isStaff && !isAdmin && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <MobileLink href="/prowadzacy" label={tPanel('staff_panel')} pathname={pathname} onClick={() => setMobileOpen(false)} />
                <MobileLink href="/prowadzacy/grafik" label={tPanel('staff_schedule')} pathname={pathname} onClick={() => setMobileOpen(false)} />
              </>
            )}

            {isLoggedIn && (
              <>
                <div className="border-t border-htg-card-border my-2" />
                <button
                  onClick={handleLogout}
                  className="py-2.5 px-4 rounded-lg text-sm font-medium text-red-500 hover:bg-htg-surface transition-colors text-left flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Wyloguj
                </button>
              </>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-htg-card-border mt-2">
              <LocaleSwitcher />
              <FontSizeToggle />
              <ThemeToggle />
              {!loading && !isLoggedIn && (
                <Link href="/login" onClick={() => setMobileOpen(false)} className="ml-auto px-3 py-1.5 rounded-lg text-sm font-medium text-htg-indigo hover:bg-htg-surface">
                  Zaloguj
                </Link>
              )}
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
        pathname === href || pathname.includes(href + '/')
          ? 'bg-htg-surface text-htg-indigo'
          : 'text-htg-fg hover:bg-htg-surface'
      }`}
    >
      {label}
    </Link>
  );
}
