import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { TranslatorGrafikManager } from './TranslatorGrafikManager';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TranslatorGrafikPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const { staffMember } = await getEffectiveStaffMember();
  if (!staffMember) return null;

  return (
    <TranslatorGrafikManager
      translatorId={staffMember.id}
      translatorName={staffMember.name}
      translatorLocale={(staffMember as any).locale ?? 'en'}
    />
  );
}
