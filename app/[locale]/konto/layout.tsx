import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { cookies, headers } from 'next/headers';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { isNagraniaPortal } from '@/lib/portal';
import NagraniaHeader from '@/components/portal/NagraniaHeader';
import SidebarLink from './SidebarLink';
import SpiritIcon from './SpiritIcon';
import { getDesignVariant } from '@/lib/design-variant';
import AccountShellV1 from '@/components/variants/v1/AccountShell';
import AccountShellV2 from '@/components/variants/v2/AccountShell';
import AccountShellV3 from '@/components/variants/v3/AccountShell';
import {
  Film, CreditCard, CalendarDays, Gift, Mail,
  LayoutDashboard, Calendar, Presentation, Users, Clock, BookOpen, Package,
  ListMusic, Archive, PlusCircle, Eye, ShieldAlert, MonitorPlay, BarChart2,
  MessagesSquare, ClipboardCheck, RefreshCw, Headphones,
} from 'lucide-react';

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

  // ─── Nagrania portal: minimal layout without sidebar ─────────
  const headersList = await headers();
  const host = headersList.get('host');
  if (isNagraniaPortal(host)) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <NagraniaHeader userEmail={user?.email ?? ''} locale={locale} />
        {children}
      </div>
    );
  }

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

  // --- Build sections based on role ---

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
    { href: '/konto/admin/nagrania-klientow', label: 'Nagrania klientów', icon: Headphones },
  ] as const;

  const piaskownicaItems = [
    { href: '/prowadzacy/spotkania-htg', label: 'Spotkania', icon: Presentation },
    { href: '/konto/admin/zestawy', label: tPanel('admin_sets'), icon: Package },
    { href: '/konto/admin/zgloszenia', label: `Aktualizacje klientów${pendingUpdates > 0 ? ` — ${pendingUpdates}` : ''}`, icon: ClipboardCheck },
    { href: '/prowadzacy/spotkania-htg/profile-uczestnikow', label: 'Profile uczestników', icon: BarChart2 },
    { href: '/konto/admin/naruszenia', label: 'Naruszenia', icon: ShieldAlert },
    { href: '/prowadzacy/symulator', label: 'Symulator sesji', icon: MonitorPlay },
    { href: '/prowadzacy/symulator-live', label: 'Symulator live', icon: MonitorPlay },
    { href: '/prowadzacy/spotkania-htg/symulator', label: 'Symulator spotkania', icon: MonitorPlay },
    { href: '/prowadzacy/spotkania-htg/odtwarzacz-symulator', label: 'Symulator odtwarzacza', icon: MonitorPlay },
  ] as const;

  const staffItems = [
    { href: '/prowadzacy', label: tPanel('staff_panel'), icon: LayoutDashboard },
    { href: '/prowadzacy/grafik', label: tPanel('staff_schedule'), icon: Calendar },
    { href: '/prowadzacy/sesje', label: tPanel('staff_sessions'), icon: Presentation },
    { href: '/prowadzacy/klienci', label: tPanel('staff_clients'), icon: Users },
    { href: '/konto/admin/skrzynka', label: 'Skrzynka', icon: Mail },
    { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', icon: MessagesSquare },
  ] as const;

  const showPublikacja = isPublikacja || isAdmin || isStaff;
  const publikacjaItems = [
    { href: '/publikacja', label: tPanel('pub_panel'), icon: LayoutDashboard },
    { href: '/publikacja/sesje', label: tPanel('pub_sessions'), icon: ListMusic },
    { href: '/publikacja/archiwum', label: tPanel('pub_archive'), icon: Archive },
    { href: '/publikacja/dodaj', label: tPanel('pub_add'), icon: PlusCircle },
  ] as const;

  const userItems = [
    { href: '/konto', label: 'Biblioteka sesji', spiritIcon: 'portal' as const },
    { href: '/konto/sesje-indywidualne', label: 'Sesje z Natalią', spiritIcon: 'eye' as const },
    { href: '/spolecznosc', label: 'Społeczność', spiritIcon: 'vesica' as const },
    { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', spiritIcon: 'feather' as const },
    { href: '/konto/polubieni', label: 'Twoi Znajomi', spiritIcon: 'bond' as const },
    { href: '/konto/podarowane-sesje', label: 'Podarowane sesje', spiritIcon: 'offering' as const },
    { href: '/konto/aktualizacja', label: 'Aktualizacja', spiritIcon: 'spiral' as const },
  ] as const;

  const profileItem = { href: '/konto/aktualizacja', label: 'Aktualizacja', icon: RefreshCw } as const;

  // Helper to render a nav section with lucide icons
  const renderSection = (title: string, items: ReadonlyArray<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>) => (
    <>
      <p className="hidden md:block px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">{title}</p>
      {items.map(({ href, label, icon: Icon }) => (
        <SidebarLink key={href} href={href} label={label} locale={locale}>
          <Icon className="w-5 h-5" />
        </SidebarLink>
      ))}
      <div className="hidden md:block border-t border-htg-card-border my-2" />
    </>
  );

  // Helper to render user section with spirit icons
  const renderUserSection = (title: string) => (
    <>
      <p className="hidden md:block px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">{title}</p>
      {userItems.map(({ href, label, spiritIcon }) => (
        <SidebarLink key={href} href={href} label={label} locale={locale}>
          <SpiritIcon type={spiritIcon} />
        </SidebarLink>
      ))}
      <div className="hidden md:block border-t border-htg-card-border my-2" />
    </>
  );

  // Build sidebar JSX
  const sidebarContent = (
    <>
      {/* ADMIN role: ADMIN + PUBLIKACJA + Piaskownica + Widok użytkownika + Profil */}
      {isAdmin && !viewAsUserEmail && (
        <>
          {renderSection('Admin', adminItems)}
          {showPublikacja && renderSection('Publikacja', publikacjaItems)}
          {renderSection('Piaskownica', piaskownicaItems)}
          {renderUserSection('Widok użytkownika')}
          {renderSection('Profil', [profileItem])}
        </>
      )}
      {isAdmin && viewAsUserEmail && renderUserSection('Moje konto')}

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

      {/* USER role: no sidebar — navigation moved to top Menu button */}
    </>
  );

  // Select shell based on variant
  const cookieStore = await cookies();
  const variant = getDesignVariant(cookieStore);
  const Shell = variant === 'v3' ? AccountShellV3
              : variant === 'v2' ? AccountShellV2
              : AccountShellV1;

  return (
    <Shell
      sidebar={sidebarContent}
      viewAsUserEmail={viewAsUserEmail}
      locale={locale}
    >
      {children}
    </Shell>
  );
}
