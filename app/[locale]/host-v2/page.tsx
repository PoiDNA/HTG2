import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import type { Metadata } from 'next';
import HostPageV2 from './HostPageV2';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'Host v2 — HTG',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HostPageV2 />;
}
