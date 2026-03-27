import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import {
  LayoutDashboard, ListMusic, Headphones, Archive, PlusCircle, Video,
} from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PublikacjaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Check role via service role (bypasses RLS on profiles)
  const supabase = createSupabaseServiceRole();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'user';
  const allowedRoles = ['publikacja', 'moderator', 'admin'];

  if (!allowedRoles.includes(role)) {
    redirect(`/${locale}/konto`);
  }

  const displayRole = role === 'admin'
    ? t('role_admin')
    : role === 'moderator'
      ? t('role_moderator')
      : t('role_editor');

  const navItems = [
    { href: '/publikacja', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/publikacja/sesje', label: t('sessions_to_edit'), icon: ListMusic },
    { href: '/publikacja/moje', label: t('my_sessions'), icon: Headphones },
    { href: '/publikacja/archiwum', label: t('archive'), icon: Archive },
    { href: '/publikacja/nagrania', label: 'Nagrania LiveKit', icon: Video },
    { href: '/publikacja/dodaj', label: t('add_session'), icon: PlusCircle },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-htg-fg">{t('title')}</h1>
          <p className="text-sm text-htg-fg-muted">{user.email} &mdash; {displayRole}</p>
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
