import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { BookOpen, Construction } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Admin' });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">{t('sessions_admin')}</h2>
      </div>
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
        <Construction className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
        <p className="text-lg font-medium text-htg-fg mb-2">W budowie</p>
        <p className="text-htg-fg-muted">{t('sessions_desc')}</p>
      </div>
    </div>
  );
}
