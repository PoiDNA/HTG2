import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import SlotsTable from '@/components/admin/SlotsTable';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SlotsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SlotsTable />;
}
