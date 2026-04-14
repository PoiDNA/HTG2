import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { PRODUCT_SLUGS, LOCALE_CURRENCY } from '@/lib/booking/constants';
import { createSupabaseServer } from '@/lib/supabase/server';
import { SessionPicker } from './SessionPicker';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Individual' });
  return { title: t('title') };
}

async function getIndividualSessions(locale: string) {
  const supabase = await createSupabaseServer();

  // PL shows classic variants; non-PL shows interpreter variants.
  // Interpreter products live under PRODUCT_SLUGS.SESSION_INTERPRETER (seed in separate PR).
  const slugs = locale === 'pl'
    ? [
        PRODUCT_SLUGS.SESSION_1ON1,
        PRODUCT_SLUGS.SESSION_ASYSTA,  // unified asysta product (replaces per-operator slugs)
        PRODUCT_SLUGS.SESSION_PARA,
      ]
    : [PRODUCT_SLUGS.SESSION_INTERPRETER];

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, description, metadata,
      prices ( id, stripe_price_id, amount, currency )
    `)
    .in('slug', slugs)
    .eq('is_active', true);

  return products || [];
}

export default async function IndividualSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Individual' });

  const sessions = await getIndividualSessions(locale);

  // Transform for client component — pick price matching locale currency
  const currency = LOCALE_CURRENCY[locale] || 'pln';
  const sessionOptions = sessions.map((s: any) => {
    const prices = s.prices || [];
    const price = prices.find((p: any) => p.currency === currency) || prices[0];
    return {
      slug: s.slug,
      name: s.name,
      description: s.description,
      amount: price?.amount || 0,
      currency: price?.currency || currency,
      priceId: price?.stripe_price_id || '',
      sessionType: s.metadata?.session_type || '',
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>
        <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      {/* How it works */}
      <div className="bg-htg-surface rounded-xl p-6 mb-10">
        <h2 className="font-serif font-semibold text-lg text-htg-fg mb-4">{t('how_title')}</h2>
        <ol className="space-y-3">
          {['step_1', 'step_2', 'step_3', 'step_4'].map((key, i) => (
            <li key={key} className="flex items-start gap-3 text-sm text-htg-fg">
              <span className="shrink-0 w-7 h-7 bg-htg-sage text-white rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(key)}</span>
            </li>
          ))}
        </ol>
      </div>

      <SessionPicker
        sessions={sessionOptions}
        labels={{
          choose: t('choose_session'),
          date_label: t('date_label'),
          date_hint: t('date_hint'),
          topics_label: t('topics_label'),
          topics_placeholder: t('topics_placeholder'),
          buy: t('buy'),
          cancel_policy: t('cancel_policy'),
          per_session: t('per_session'),
        }}
      />
    </div>
  );
}
