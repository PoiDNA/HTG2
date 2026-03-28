import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import LiveSimulatorClient from './LiveSimulatorClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SymulatorLivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LiveSimulatorClient />;
}
