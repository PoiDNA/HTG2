import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { CreditCard } from 'lucide-react';
import { getEffectiveUser } from '@/lib/admin/effective-user';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MySubscriptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const { userId, supabase } = await getEffectiveUser();

  const { data: entitlements } = await supabase
    .from('entitlements')
    .select('id, type, scope_month, valid_from, valid_until, is_active, stripe_subscription_id, product:products ( name )')
    .eq('user_id', userId)
    .order('valid_until', { ascending: false });

  const subscriptions = entitlements || [];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('my_subscriptions')}</h2>

      {subscriptions.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <CreditCard className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">{t('no_subscriptions')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((ent: any) => {
            const isActive = ent.is_active && new Date(ent.valid_until) > new Date();
            const validDate = new Date(ent.valid_until).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            const typeLabel = ent.type === 'yearly'
              ? 'Pakiet Roczny'
              : ent.type === 'monthly'
                ? `Pakiet Miesięczny${ent.scope_month ? ` (${ent.scope_month})` : ''}`
                : 'Sesja pojedyncza';

            return (
              <div key={ent.id} className="bg-htg-card border border-htg-card-border rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-htg-fg">
                      {ent.product?.name || typeLabel}
                    </h3>
                    <p className="text-sm text-htg-fg-muted">
                      {t('valid_until', { date: validDate })}
                    </p>
                  </div>
                  <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                    isActive
                      ? 'bg-htg-sage/10 text-htg-sage'
                      : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                    {isActive ? t('subscription_active') : t('subscription_expired')}
                  </span>
                </div>
              </div>
            );
          })}
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
