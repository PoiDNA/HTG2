import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { Film, CreditCard, FileText, UserCircle, CalendarDays } from 'lucide-react';

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

  const navItems = [
    { href: '/konto', label: t('my_sessions'), icon: Film },
    { href: '/konto/sesje-indywidualne', label: tBooking('nav_label'), icon: CalendarDays },
    { href: '/konto/subskrypcje', label: t('my_subscriptions'), icon: CreditCard },
    { href: '/konto/zamowienia', label: t('orders'), icon: FileText },
    { href: '/konto/profil', label: t('profile'), icon: UserCircle },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-serif font-bold text-htg-fg mb-8">{t('title')}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav (desktop) / horizontal tabs (mobile) */}
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

        {/* Content */}
        <div className="flex-grow min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
