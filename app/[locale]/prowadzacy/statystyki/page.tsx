import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
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
  return <PlayStatsClient />;
}
