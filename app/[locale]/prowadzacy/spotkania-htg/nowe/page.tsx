import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import MeetingForm from '@/components/meeting/MeetingForm';

export default async function NoweSpotkaniePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) redirect(`/${locale}/konto`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif font-semibold text-htg-fg">Nowe spotkanie HTG</h2>
        <p className="text-sm text-htg-fg-muted mt-1">Skonfiguruj nowe spotkanie grupowe</p>
      </div>
      <MeetingForm locale={locale} basePath="/prowadzacy/spotkania-htg" />
    </div>
  );
}
