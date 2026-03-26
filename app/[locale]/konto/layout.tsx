import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import {
  Film, CreditCard, FileText, UserCircle, CalendarDays, Heart,
  LayoutDashboard, Calendar, Presentation, Users, Clock, BookOpen, Package,
  ListMusic, Archive, PlusCircle, Eye,
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
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tPanel = await getTranslations({ locale, namespace: 'PanelNav' });

  // Determine user role
  let isAdmin = false;
  let isStaff = false;
  let isPublikacja = false;
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
  } catch {
    // fallback — just show user items
  }

  // --- Build sections based on role ---

  // ADMIN section (admin only)
  const adminItems = [
    { href: '/konto/admin', label: tPanel('admin_panel'), icon: LayoutDashboard },
    { href: '/konto/admin/kalendarz', label: tPanel('admin_calendar'), icon: Calendar },
    { href: '/konto/admin/kolejka', label: tPanel('admin_queue'), icon: Users },
    { href: '/konto/admin/sloty', label: tPanel('admin_slots'), icon: Clock },
    { href: '/konto/admin/uzytkownicy', label: tPanel('admin_users'), icon: Users },
    { href: '/konto/admin/subskrypcje', label: tPanel('admin_subscriptions'), icon: CreditCard },
    { href: '/konto/admin/sesje', label: tPanel('admin_sessions'), icon: BookOpen },
    { href: '/konto/admin/zestawy', label: tPanel('admin_sets'), icon: Package },
    { href: '/konto/admin/podglad', label: tPanel('admin_preview'), icon: Eye },
  ] as const;

  // STAFF section (moderator/prowadzacy — NOT admin)
  const staffItems = [
    { href: '/prowadzacy', label: tPanel('staff_panel'), icon: LayoutDashboard },
    { href: '/prowadzacy/grafik', label: tPanel('staff_schedule'), icon: Calendar },
    { href: '/prowadzacy/sesje', label: tPanel('staff_sessions'), icon: Presentation },
    { href: '/prowadzacy/klienci', label: tPanel('staff_clients'), icon: Users },
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
    { href: '/konto', label: t('my_sessions'), icon: Film },
    { href: '/konto/sesje-indywidualne', label: tPanel('individual_sessions'), icon: CalendarDays },
    { href: '/konto/subskrypcje', label: t('my_subscriptions'), icon: CreditCard },
    { href: '/konto/zamowienia', label: t('orders'), icon: FileText },
    { href: '/konto/polubieni', label: 'Polubieni', icon: Heart },
    { href: '/konto/profil', label: t('profile'), icon: UserCircle },
  ] as const;

  // Profile-only item
  const profileItem = { href: '/konto/profil', label: t('profile'), icon: UserCircle } as const;

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
      <h1 className="text-3xl font-serif font-bold text-htg-fg mb-8">{t('title')}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav */}
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">

            {/* ADMIN role: ADMIN + PUBLIKACJA + Profil */}
            {isAdmin && (
              <>
                {renderSection('Admin', adminItems)}
                {showPublikacja && renderSection('Publikacja', publikacjaItems)}
                {renderSection('Profil', [profileItem])}
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
