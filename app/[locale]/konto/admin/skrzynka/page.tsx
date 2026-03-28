import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import EmailInbox from '@/components/admin/EmailInbox';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SkrzynkaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <EmailInbox />;
}
