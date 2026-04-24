import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import SpikeClient from './SpikeClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StudioSpike01Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireAdmin();
  if ('error' in auth) return redirect({ href: '/konto', locale });

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-1">DUB-SPIKE-01 — MediaRecorder MIME matrix</h1>
      <p className="text-sm text-zinc-400 mb-8">
        Nagraj 10–15 sek. audio, odsłuchaj podgląd, wyślij do serwera. Sprawdzamy co wspiera ta przeglądarka i czy serwer potrafi odczytać blob.
      </p>
      <SpikeClient />
    </div>
  );
}
