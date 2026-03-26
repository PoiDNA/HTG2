import { setRequestLocale, getTranslations } from 'next-intl/server';
import StaffScheduleEditor from '@/components/staff/StaffScheduleEditor';

export default async function StaffSchedulePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Staff' });

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-htg-fg mb-6">{t('schedule_title')}</h2>
      <StaffScheduleEditor />
    </div>
  );
}
