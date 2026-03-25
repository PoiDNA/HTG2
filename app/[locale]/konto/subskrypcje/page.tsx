import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { CreditCard } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MySubscriptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  // TODO: Fetch from Supabase htg.entitlements WHERE type = 'subscription'
  const subscriptions: any[] = [];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('my_subscriptions')}</h2>

      {subscriptions.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <CreditCard className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">Nie masz aktywnych subskrypcji.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub: any) => (
            <div key={sub.id} className="bg-htg-card border border-htg-card-border rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-htg-fg">{sub.name}</h3>
                  <p className="text-sm text-htg-fg-muted">
                    {t('valid_until', { date: sub.validUntil })}
                  </p>
                </div>
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                  sub.isActive
                    ? 'bg-htg-sage/10 text-htg-sage'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {sub.isActive ? t('subscription_active') : t('subscription_expired')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stripe Customer Portal link */}
      <div className="mt-8">
        <a
          href="/api/stripe/portal"
          className="text-sm text-htg-sage hover:underline"
        >
          {t('manage_subscription')} →
        </a>
      </div>
    </div>
  );
}
