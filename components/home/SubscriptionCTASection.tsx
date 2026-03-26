import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { Star } from 'lucide-react';

export default function SubscriptionCTASection() {
  const t = useTranslations('Home');
  const ts = useTranslations('Subscriptions');

  const tiers = [
    {
      key: 'a_la_carte',
      title: ts('a_la_carte_title'),
      desc: ts('a_la_carte_desc'),
      price: ts('a_la_carte_price', { price: '30' }),
      badge: null,
      notice: ts('ownership_notice'),
    },
    {
      key: 'monthly',
      title: ts('monthly_title'),
      desc: ts('monthly_desc'),
      price: ts('monthly_price', { price: '99' }),
      badge: null,
      notice: ts('ownership_notice'),
    },
    {
      key: 'yearly',
      title: ts('yearly_title'),
      desc: ts('yearly_desc'),
      price: ts('yearly_price', { price: '999' }),
      badge: ts('yearly_badge'),
      notice: ts('rental_notice'),
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-htg-surface">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('subscriptions_title')}
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            {t('subscriptions_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.key}
              className={`bg-htg-card border rounded-xl p-6 flex flex-col ${
                tier.badge ? 'border-htg-sage ring-2 ring-htg-sage/20' : 'border-htg-card-border'
              }`}
            >
              {tier.badge && (
                <div className="flex items-center gap-1 text-htg-sage text-sm font-semibold mb-3">
                  <Star className="w-4 h-4 fill-current" />
                  {tier.badge}
                </div>
              )}
              <h3 className="font-serif font-bold text-xl text-htg-fg mb-2">{tier.title}</h3>
              <p className="text-htg-fg-muted text-sm mb-4 flex-grow">{tier.desc}</p>
              <p className="text-lg font-semibold text-htg-fg mb-2">{tier.price}</p>
              <p className="text-xs text-htg-fg-muted mb-4 bg-htg-surface rounded px-2 py-1 inline-block">
                {tier.notice}
              </p>
              <Link
                href="/subskrypcje"
                className={`text-center py-3 px-6 rounded-lg font-medium transition-colors ${
                  tier.badge
                    ? 'bg-htg-sage text-white hover:bg-htg-sage-dark'
                    : 'bg-htg-indigo text-white hover:bg-htg-indigo-light'
                }`}
              >
                {tier.key === 'yearly' ? ts('subscribe') : ts('buy')}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
