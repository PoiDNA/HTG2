import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import PlayerSimulatorClient from './PlayerSimulatorClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PlayerSimulatorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayerSimulatorClient />;
}
