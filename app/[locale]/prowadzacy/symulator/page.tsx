import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import SessionSimulator from './SessionSimulator';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SessionSimulator />;
}
