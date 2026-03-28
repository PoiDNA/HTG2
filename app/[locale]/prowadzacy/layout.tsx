import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { stopImpersonation } from '@/lib/admin/impersonate';
import { LayoutDashboard, Calendar, Presentation, Users, Video, ArrowLeft, Eye, MonitorPlay, BarChart2, Users2 } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StaffLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Staff' });

  const { user, staffMember, isAdminViewAs, viewAsName } = await getEffectiveStaffMember();

  if (!user) redirect(`/${locale}/login`);

  const isAdmin = isAdminEmail(user.email ?? '');
  const isAdminOrMod = isAdmin || false; // admin always allowed

  if (!staffMember && !isAdminOrMod) {
    redirect(`/${locale}/konto`);
  }

  const displayName = viewAsName ?? staffMember?.name ?? user.email ?? '';
  const displayRole = staffMember?.role === 'practitioner'
    ? t('role_practitioner')
    : staffMember?.role === 'assistant'
      ? t('role_assistant')
      : t('role_admin');

  const isAssistant = staffMember?.role === 'assistant';
  // Stats visible only to admin and practitioner (Natalia), not assistants
  const canSeeStats = isAdmin || staffMember?.role === 'practitioner';

  const navItems = [
    { href: '/prowadzacy', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/prowadzacy/sesje', label: t('sessions'), icon: Presentation },
    { href: '/prowadzacy/grafik', label: t('schedule'), icon: Calendar },
    { href: '/prowadzacy/klienci', label: t('clients'), icon: Users },
    { href: '/konto/nagrania-klienta', label: 'Nagrania przed/po', icon: Video },
    { href: '/prowadzacy/symulator', label: 'Symulator sesji', icon: MonitorPlay },
    { href: '/prowadzacy/symulator-live', label: 'Symulator live', icon: MonitorPlay },
    ...(canSeeStats ? [{ href: '/prowadzacy/statystyki', label: 'Statystyki odtworzeń', icon: BarChart2 }] : []),
    { href: '/prowadzacy/spotkania-htg', label: 'Spotkania HTG', icon: Users2 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Admin impersonation banner */}
      {isAdminViewAs && (
        <div className="flex items-center justify-between mb-4 px-4 py-3 bg-htg-warm/10 border border-htg-warm/40 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-htg-warm">
            <Eye className="w-4 h-4" />
            <span>Przeglądasz panel jako: <strong>{viewAsName}</strong></span>
          </div>
          <form action={stopImpersonation}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-htg-warm/20 hover:bg-htg-warm/30 text-htg-warm rounded-lg transition-colors font-medium">
              <ArrowLeft className="w-3 h-3" />
              Wróć do admina
            </button>
          </form>
        </div>
      )}

      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-htg-fg">{t('title')}</h1>
          <p className="text-sm text-htg-fg-muted">{displayName} &mdash; {displayRole}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <nav className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors whitespace-nowrap"
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex-grow min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
