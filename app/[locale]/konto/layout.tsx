import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { stopUserImpersonation } from '@/lib/admin/impersonate';
import {
  Film, CreditCard, FileText, UserCircle, CalendarDays, Heart, Gift, Mail,
  LayoutDashboard, Calendar, Presentation, Users, Clock, BookOpen, Package,
  ListMusic, Archive, PlusCircle, Eye, ShieldAlert, MonitorPlay, BarChart2,
  MessagesSquare, ClipboardCheck, RefreshCw,
} from 'lucide-react';

/* Required consent types for full panel access */
const REQUIRED_CONSENT_TYPES = ['terms_v3', 'privacy_v3', 'sensitive_data', 'recording_publication'];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AccountLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tPanel = await getTranslations({ locale, namespace: 'PanelNav' });

  // Determine user role
  let isAdmin = false;
  let isStaff = false;
  let isPublikacja = false;
  let viewAsUserEmail: string | null = null;
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      isAdmin = isAdminEmail(user.email);
      isStaff = isStaffEmail(user.email);
    }
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role === 'admin') isAdmin = true;
      if (profile?.role === 'moderator' || profile?.role === 'admin') isStaff = true;
      if (profile?.role === 'publikacja') isPublikacja = true;
    }
    // Check user impersonation cookie (admin only)
    if (isAdmin) {
      const cookieStore = await cookies();
      const viewAsUserId = cookieStore.get(IMPERSONATE_USER_COOKIE)?.value;
      if (viewAsUserId) {
        const db = createSupabaseServiceRole();
        const { data: viewAsProfile } = await db
          .from('profiles')
          .select('email, display_name')
          .eq('id', viewAsUserId)
          .single();
        if (viewAsProfile) {
          viewAsUserEmail = viewAsProfile.display_name
            ? `${viewAsProfile.display_name} (${viewAsProfile.email})`
            : (viewAsProfile.email ?? viewAsUserId);
        }
      }
    }
  } catch {
    // fallback — just show user items
  }

  // --- Fetch pending update requests count for admin badge ---
  let pendingUpdates = 0;
  if (isAdmin) {
    try {
      const db = createSupabaseServiceRole();
      const { count } = await db
        .from('account_update_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingUpdates = count || 0;
    } catch { /* ignore */ }
  }

  // --- Consent gate: redirect to /konto/zgody if missing required consents ---
  // Skip for admins/staff (they manage the system) and for the zgody page itself
  if (!isAdmin && !isStaff) {
    try {
      const headerStore = await headers();
      const currentPath = headerStore.get('x-next-url') || headerStore.get('x-invoke-path') || headerStore.get('referer') || '';
      const isOnZgodyPage = currentPath.includes('/konto/zgody');

      if (!isOnZgodyPage) {
        const supabase = await createSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userConsents } = await supabase
            .from('consent_records')
            .select('consent_type')
            .eq('user_id', user.id)
            .eq('granted', true);

          const grantedTypes = new Set((userConsents ?? []).map((c: { consent_type: string }) => c.consent_type));
          const missingConsents = REQUIRED_CONSENT_TYPES.filter(t => !grantedTypes.has(t));

          if (missingConsents.length > 0) {
            redirect(`/${locale}/konto/zgody`);
          }
        }
      }
    } catch (e) {
      // redirect() throws a special error in Next.js — re-throw it
      if (e && typeof e === 'object' && 'digest' in e) throw e;
      // Otherwise non-blocking
    }
  }

  // --- Build sections based on role ---

  // ADMIN section (admin only)
  const adminItems = [
    { href: '/konto/admin/uzytkownicy', label: tPanel('admin_users'), icon: Users },
    { href: '/konto/admin/sesje', label: tPanel('admin_sessions'), icon: BookOpen },
    { href: '/konto/admin/podglad', label: tPanel('admin_preview'), icon: Eye },
    { href: '/spolecznosc', label: 'Społeczność', icon: MessagesSquare },
    { href: '/konto/admin/skrzynka', label: 'Skrzynka', icon: Mail },
    { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', icon: MessagesSquare },
    { href: '/konto/admin', label: tPanel('admin_panel'), icon: LayoutDashboard },
    { href: '/konto/admin/kalendarz', label: tPanel('admin_calendar'), icon: Calendar },
    { href: '/konto/admin/kolejka', label: tPanel('admin_queue'), icon: Users },
    { href: '/konto/admin/sloty', label: tPanel('admin_slots'), icon: Clock },
    { href: '/konto/admin/subskrypcje', label: tPanel('admin_subscriptions'), icon: CreditCard },
  ] as const;

  // PIASKOWNICA section (admin only — narzędzia i testy)
  const piaskownicaItems = [
    { href: '/konto/admin/zestawy', label: tPanel('admin_sets'), icon: Package },
    { href: '/konto/admin/zgloszenia', label: `Aktualizacje klientów${pendingUpdates > 0 ? ` — ${pendingUpdates}` : ''}`, icon: ClipboardCheck },
    { href: '/prowadzacy/spotkania-htg/profile-uczestnikow', label: 'Profile uczestników', icon: BarChart2 },
    { href: '/konto/admin/naruszenia', label: 'Naruszenia', icon: ShieldAlert },
    { href: '/prowadzacy/symulator', label: 'Symulator sesji', icon: MonitorPlay },
    { href: '/prowadzacy/symulator-live', label: 'Symulator live', icon: MonitorPlay },
    { href: '/prowadzacy/spotkania-htg/symulator', label: 'Symulator spotkania', icon: MonitorPlay },
    { href: '/prowadzacy/spotkania-htg/odtwarzacz-symulator', label: 'Symulator odtwarzacza', icon: MonitorPlay },
  ] as const;

  // STAFF section (moderator/prowadzacy — NOT admin)
  const staffItems = [
    { href: '/prowadzacy', label: tPanel('staff_panel'), icon: LayoutDashboard },
    { href: '/prowadzacy/grafik', label: tPanel('staff_schedule'), icon: Calendar },
    { href: '/prowadzacy/sesje', label: tPanel('staff_sessions'), icon: Presentation },
    { href: '/prowadzacy/klienci', label: tPanel('staff_clients'), icon: Users },
    { href: '/konto/admin/skrzynka', label: 'Skrzynka', icon: Mail },
    { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', icon: MessagesSquare },
  ] as const;

  // PUBLIKACJA section (admin, moderator, publikacja)
  const showPublikacja = isPublikacja || isAdmin || isStaff;
  const publikacjaItems = [
    { href: '/publikacja', label: tPanel('pub_panel'), icon: LayoutDashboard },
    { href: '/publikacja/sesje', label: tPanel('pub_sessions'), icon: ListMusic },
    { href: '/publikacja/archiwum', label: tPanel('pub_archive'), icon: Archive },
    { href: '/publikacja/dodaj', label: tPanel('pub_add'), icon: PlusCircle },
  ] as const;

  // USER section (regular clients only)
  const userItems = [
    { href: '/konto', label: 'Biblioteka sesji', icon: Film },
    { href: '/konto/sesje-indywidualne', label: 'Sesje z Natalią', icon: CalendarDays },
    { href: '/spolecznosc', label: 'Społeczność', icon: MessagesSquare },
    { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', icon: Mail },
    { href: '/konto/subskrypcje', label: 'Twoje Aktywacje', icon: CreditCard },
    { href: '/konto/polubieni', label: 'Twoi Znajomi', icon: Users },
    { href: '/konto/podarowane-sesje', label: 'Podarowane sesje', icon: Gift },
    { href: '/konto/aktualizacja', label: 'Aktualizacja', icon: RefreshCw },
  ] as const;

  // Aktualizacja item (replaces standalone Profil)
  const profileItem = { href: '/konto/aktualizacja', label: 'Aktualizacja', icon: RefreshCw } as const;

  // Helper to render a nav section
  const renderSection = (title: string, items: ReadonlyArray<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>) => (
    <>
      <p className="hidden md:block px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">{title}</p>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors whitespace-nowrap"
        >
          <Icon className="w-5 h-5 shrink-0" />
          {label}
        </Link>
      ))}
      <div className="hidden md:block border-t border-htg-card-border my-2" />
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {viewAsUserEmail && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-600 dark:text-amber-400">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Przeglądasz konto jako: <strong>{viewAsUserEmail}</strong></span>
          <form action={stopUserImpersonation}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap">
              Wróć do admina
            </button>
          </form>
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav */}
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">

            {/* ADMIN role: ADMIN + PUBLIKACJA + Profil (but show user nav when impersonating) */}
            {isAdmin && !viewAsUserEmail && (
              <>
                {renderSection('Admin', adminItems)}
                {showPublikacja && renderSection('Publikacja', publikacjaItems)}
                {renderSection('Piaskownica', piaskownicaItems)}
                {renderSection('Profil', [profileItem])}
              </>
            )}
            {isAdmin && viewAsUserEmail && (
              <>
                {renderSection('Moje konto', userItems)}
              </>
            )}

            {/* MODERATOR role (staff, not admin): PANEL PROWADZACEGO + Profil */}
            {isStaff && !isAdmin && (
              <>
                {renderSection('Panel prowadzącego', staffItems)}
                {renderSection('Profil', [profileItem])}
              </>
            )}

            {/* PUBLIKACJA role (not admin, not staff): PUBLIKACJA + Profil */}
            {isPublikacja && !isAdmin && !isStaff && (
              <>
                {renderSection('Publikacja', publikacjaItems)}
                {renderSection('Profil', [profileItem])}
              </>
            )}

            {/* USER role (no special role): full MOJE KONTO */}
            {!isAdmin && !isStaff && !isPublikacja && (
              <>
                {renderSection(t('title'), userItems)}
              </>
            )}

          </div>
        </nav>

        {/* Content */}
        <div className="flex-grow min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
