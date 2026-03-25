import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('profile')}</h2>

      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-6">
        {/* Profile form */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-htg-fg">{t('profile_name')}</span>
            <input
              type="text"
              className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base"
              placeholder="Jan Kowalski"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-htg-fg">{t('profile_email')}</span>
            <input
              type="email"
              className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg-muted text-base cursor-not-allowed"
              disabled
              placeholder="twoj@email.pl"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-htg-fg">{t('profile_phone')}</span>
            <input
              type="tel"
              className="mt-1 w-full px-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base"
              placeholder="+48 000 000 000"
            />
          </label>

          <button className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors">
            {t('profile_save')}
          </button>
        </div>

        {/* GDPR Consents */}
        <div className="border-t border-htg-card-border pt-6">
          <h3 className="text-lg font-semibold text-htg-fg mb-4">{t('gdpr_consents')}</h3>
          <p className="text-sm text-htg-fg-muted">
            {/* TODO: Fetch from htg.consent_records */}
            Zarządzaj swoimi zgodami na przetwarzanie danych.
          </p>
        </div>

        {/* Danger zone */}
        <div className="border-t border-htg-card-border pt-6">
          <button className="text-red-600 text-sm font-medium hover:underline">
            {t('delete_account')}
          </button>
        </div>
      </div>
    </div>
  );
}
