import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { LayoutDashboard, Calendar } from 'lucide-react';

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

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Check if user is admin/moderator
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdminOrMod = profile?.role === 'admin' || profile?.role === 'moderator';

  // Check if user is a staff member (by user_id or email)
  let staffMember = null;

  const { data: byUserId } = await supabase
    .from('staff_members')
    .select('id, name, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (byUserId) {
    staffMember = byUserId;
  } else if (user.email) {
    const { data: byEmail } = await supabase
      .from('staff_members')
      .select('id, name, role')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();
    staffMember = byEmail;
  }

  if (!staffMember && !isAdminOrMod) {
    redirect(`/${locale}/konto`);
  }

  const displayName = staffMember?.name || user.email || '';
  const displayRole = staffMember?.role === 'practitioner'
    ? t('role_practitioner')
    : staffMember?.role === 'assistant'
      ? t('role_assistant')
      : t('role_admin');

  const navItems = [
    { href: '/prowadzacy', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/prowadzacy/grafik', label: t('schedule'), icon: Calendar },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
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
