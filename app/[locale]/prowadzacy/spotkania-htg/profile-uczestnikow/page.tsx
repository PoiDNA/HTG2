import { setRequestLocale } from 'next-intl/server';
import { locales, redirect } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import ProfilesClient from './ProfilesClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ProfileyUczestnikowPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return redirect({href: '/login', locale});

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) return redirect({href: '/prowadzacy', locale});

  return <ProfilesClient isAdmin={isAdmin} />;
}
