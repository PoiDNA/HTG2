import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales } from '@/i18n-config';
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
  if (!user) redirect(`/${locale}/login`);

  const isAdmin       = isAdminEmail(user.email ?? '');
  const isPractitioner = staffMember?.role === 'practitioner';
  if (!isAdmin && !isPractitioner) redirect(`/${locale}/prowadzacy`);

  return <ProfilesClient isAdmin={isAdmin} />;
}
