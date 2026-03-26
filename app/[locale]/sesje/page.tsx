import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import SessionCatalog from './SessionCatalog';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  return {
    title: t('title'),
    description: t('subtitle'),
    openGraph: {
      title: t('title'),
      description: t('subtitle'),
      url: `https://htgcyou.com/${locale}/sesje`,
    },
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface SessionTemplate {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  thumbnail_url: string | null;
}

interface MonthlySet {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  month_label: string | null;
  cover_image_url: string | null;
  sessions: SessionTemplate[];
}

async function getMonthlySets(): Promise<MonthlySet[]> {
  const supabase = await createSupabaseServer();

  const { data: sets, error } = await supabase
    .from('monthly_sets')
    .select(`
      id, slug, title, description, month_label, cover_image_url,
      set_sessions (
        sort_order,
        session:session_templates ( id, slug, title, description, duration_minutes, thumbnail_url )
      )
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false });

  if (error || !sets) return [];

  return sets.map((set: any) => ({
    ...set,
    sessions: (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter(Boolean),
  }));
}

async function getStandaloneSessions(): Promise<SessionTemplate[]> {
  const supabase = await createSupabaseServer();

  // Sessions not in any set — for a la carte purchase
  const { data, error } = await supabase
    .from('session_templates')
    .select('id, slug, title, description, duration_minutes, thumbnail_url')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  return data || [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Sessions' });

  const monthlySets = await getMonthlySets();

  // Fetch prices from DB
  const supabase2 = await createSupabaseServer();
  const { data: sessionProduct } = await supabase2.from('products').select('id').eq('slug', 'sesja-pojedyncza').single();
  const { data: monthlyProduct } = await supabase2.from('products').select('id').eq('slug', 'pakiet-miesieczny').single();

  const { data: sessionPrice } = await supabase2.from('prices').select('stripe_price_id, amount')
    .eq('product_id', sessionProduct?.id || '').eq('is_active', true).single();
  const { data: monthlyPrice } = await supabase2.from('prices').select('stripe_price_id, amount')
    .eq('product_id', monthlyProduct?.id || '').eq('is_active', true).single();

  const catalogData = monthlySets.map(ms => ({
    id: ms.id,
    title: ms.title,
    month_label: ms.month_label || '',
    sessions: ms.sessions.map(s => ({ id: s.id, title: s.title, description: s.description })),
  }));

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

      <SessionCatalog
        monthSets={catalogData}
        prices={{
          sessionPriceId: sessionPrice?.stripe_price_id || '',
          sessionAmount: (sessionPrice?.amount || 3000) / 100,
          monthlyPriceId: monthlyPrice?.stripe_price_id || '',
          monthlyAmount: (monthlyPrice?.amount || 9900) / 100,
        }}
      />
    </div>
  );
}
