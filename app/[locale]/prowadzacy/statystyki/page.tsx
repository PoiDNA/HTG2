import { setRequestLocale } from 'next-intl/server';
import { locales, redirect } from '@/i18n-config';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { isAdminEmail } from '@/lib/roles';
import PlayStatsClient from './PlayStatsClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StatystykiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return redirect({href: '/login', locale});

  const isAdmin = isAdminEmail(user.email ?? '');
  const canSeeStats = isAdmin || staffMember?.role === 'practitioner';

  if (!canSeeStats) return redirect({href: '/prowadzacy', locale});

  return <PlayStatsClient />;
}
