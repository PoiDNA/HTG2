import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import CalendarManager from '@/components/admin/CalendarManager';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function CalendarPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CalendarManager />;
}
