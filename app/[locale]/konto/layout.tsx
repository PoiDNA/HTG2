import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import {
  Film, CreditCard, FileText, UserCircle, CalendarDays,
  LayoutDashboard, Calendar, Presentation, Users, Clock, BookOpen, Package,
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
  const tBooking = await getTranslations({ locale, namespace: 'Booking' });
  const tPanel = await getTranslations({ locale, namespace: 'PanelNav' });

  // Determine user role
  let isAdmin = false;
  let isStaff = false;
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
    }
  } catch {
    // fallback — just show user items
  }

  const userItems = [
    { href: '/konto', label: t('my_sessions'), icon: Film },
    { href: '/konto/sesje-indywidualne', label: tBooking('nav_label'), icon: CalendarDays },
    { href: '/konto/subskrypcje', label: t('my_subscriptions'), icon: CreditCard },
    { href: '/konto/zamowienia', label: t('orders'), icon: FileText },
    { href: '/konto/profil', label: t('profile'), icon: UserCircle },
  ] as const;

  const staffItems = [
    { href: '/prowadzacy', label: tPanel('staff_panel'), icon: LayoutDashboard },
    { href: '/prowadzacy/grafik', label: tPanel('staff_schedule'), icon: Calendar },
    { href: '/prowadzacy/sesje', label: tPanel('staff_sessions'), icon: Presentation },
  ] as const;

  const adminItems = [
    { href: '/admin', label: tPanel('admin_panel'), icon: LayoutDashboard },
    { href: '/admin/kalendarz', label: tPanel('admin_calendar'), icon: Calendar },
    { href: '/admin/kolejka', label: tPanel('admin_queue'), icon: Users },
    { href: '/admin/sloty', label: tPanel('admin_slots'), icon: Clock },
    { href: '/admin/uzytkownicy', label: tPanel('admin_users'), icon: Users },
    { href: '/admin/subskrypcje', label: tPanel('admin_subscriptions'), icon: CreditCard },
    { href: '/admin/sesje', label: tPanel('admin_sessions'), icon: BookOpen },
    { href: '/admin/zestawy', label: tPanel('admin_sets'), icon: Package },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-serif font-bold text-htg-fg mb-8">{t('title')}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav */}
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {userItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors whitespace-nowrap"
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            ))}

            {isStaff && (
              <>
                <div className="hidden md:block border-t border-htg-card-border my-2" />
                <p className="hidden md:block px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">{tPanel('staff_panel')}</p>
                {staffItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors whitespace-nowrap"
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                ))}
              </>
            )}

            {isAdmin && (
              <>
                <div className="hidden md:block border-t border-htg-card-border my-2" />
                <p className="hidden md:block px-4 text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1">Admin</p>
                {adminItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors whitespace-nowrap"
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                ))}
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
