import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { Star, Check } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Subscriptions' });
  return { title: t('title') };
}

export default async function SubscriptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Subscriptions' });

  const features = {
    a_la_carte: [
      'Wybierasz konkretne sesje',
      'Z dowolnych miesięcy',
      'Dostęp na 24 miesiące',
      'Maksymalna elastyczność',
    ],
    monthly: [
      'Gotowy zestaw z miesiąca (3–4 sesje)',
      'Oszczędność vs. pojedyncze',
      'Dostęp na 24 miesiące',
      'Dedykowana grafika zestawu',
    ],
    yearly: [
      'Cały katalog + nowe sesje',
      'Płacisz za 10 mies., dostajesz 12',
      'Zero decyzji — all inclusive',
      'Najniższa cena za sesję',
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>
        <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* A la carte */}
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 flex flex-col">
          <h2 className="font-serif font-bold text-2xl text-htg-fg mb-2">{t('a_la_carte_title')}</h2>
          <p className="text-htg-fg-muted text-sm mb-4">{t('a_la_carte_desc')}</p>
          <p className="text-2xl font-bold text-htg-fg mb-1">{t('a_la_carte_price', { price: '150' })}</p>
          <p className="text-xs text-htg-sage font-medium bg-htg-sage/10 rounded px-2 py-1 inline-block mb-6 w-fit">
            {t('ownership_notice')}
          </p>
          <ul className="space-y-3 mb-8 flex-grow">
            {features.a_la_carte.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-htg-fg">
                <Check className="w-4 h-4 text-htg-sage mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button className="w-full bg-htg-indigo text-white py-3 rounded-lg font-medium hover:bg-htg-indigo-light transition-colors">
            {t('buy')}
          </button>
        </div>

        {/* Monthly */}
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 flex flex-col">
          <h2 className="font-serif font-bold text-2xl text-htg-fg mb-2">{t('monthly_title')}</h2>
          <p className="text-htg-fg-muted text-sm mb-4">{t('monthly_desc')}</p>
          <p className="text-2xl font-bold text-htg-fg mb-1">{t('monthly_price', { price: '300' })}</p>
          <p className="text-xs text-htg-sage font-medium bg-htg-sage/10 rounded px-2 py-1 inline-block mb-6 w-fit">
            {t('ownership_notice')}
          </p>
          <ul className="space-y-3 mb-8 flex-grow">
            {features.monthly.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-htg-fg">
                <Check className="w-4 h-4 text-htg-sage mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button className="w-full bg-htg-indigo text-white py-3 rounded-lg font-medium hover:bg-htg-indigo-light transition-colors">
            {t('buy')}
          </button>
        </div>

        {/* Yearly — highlighted */}
        <div className="bg-htg-card border-2 border-htg-sage rounded-2xl p-8 flex flex-col ring-2 ring-htg-sage/20 relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-htg-sage text-white text-sm font-semibold px-4 py-1 rounded-full">
            <Star className="w-4 h-4 fill-current" />
            {t('yearly_badge')}
          </div>
          <h2 className="font-serif font-bold text-2xl text-htg-fg mb-2 mt-2">{t('yearly_title')}</h2>
          <p className="text-htg-fg-muted text-sm mb-4">{t('yearly_desc')}</p>
          <p className="text-2xl font-bold text-htg-fg mb-1">{t('yearly_price', { price: '3000' })}</p>
          <p className="text-xs text-htg-warm-text font-medium bg-htg-warm/10 rounded px-2 py-1 inline-block mb-4 w-fit">
            {t('rental_notice')}
          </p>
          <p className="text-xs text-htg-fg-muted mb-6 bg-htg-surface rounded-lg p-3 leading-relaxed">
            {t('yearly_notice')}
          </p>
          <ul className="space-y-3 mb-8 flex-grow">
            {features.yearly.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-htg-fg">
                <Check className="w-4 h-4 text-htg-sage mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button className="w-full bg-htg-sage text-white py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors">
            {t('subscribe')}
          </button>
        </div>
      </div>
    </div>
  );
}
