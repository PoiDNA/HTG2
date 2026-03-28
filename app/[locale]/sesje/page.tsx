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
        session:session_templates ( id, slug, title, description, duration_minutes, thumbnail_url, category, tags, view_count )
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
// Purchased sessions helper
// ---------------------------------------------------------------------------

async function getUserPurchased(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, userId: string) {
  // Check yearly (full-catalog) subscription
  const { data: yearlyEnt } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'yearly')
    .eq('is_active', true)
    .gt('valid_until', new Date().toISOString())
    .maybeSingle();

  if (yearlyEnt) return { purchasedSessionIds: [] as string[], purchasedMonthSetIds: [] as string[], hasYearly: true };

  // Individual session entitlements
  const { data: sessionEnts } = await supabase
    .from('entitlements')
    .select('session_id')
    .eq('user_id', userId)
    .eq('type', 'session')
    .eq('is_active', true)
    .gt('valid_until', new Date().toISOString())
    .not('session_id', 'is', null);

  const sessionIds: string[] = (sessionEnts || []).map((e: any) => e.session_id);

  // Monthly package entitlements → resolve which sets + their sessions
  const { data: monthlyEnts } = await supabase
    .from('entitlements')
    .select('product_id')
    .eq('user_id', userId)
    .eq('type', 'monthly')
    .eq('is_active', true)
    .gt('valid_until', new Date().toISOString())
    .not('product_id', 'is', null);

  const productIds: string[] = (monthlyEnts || []).map((e: any) => e.product_id).filter(Boolean);

  let monthSetIds: string[] = [];
  let monthSessionIds: string[] = [];

  if (productIds.length > 0) {
    const { data: sets } = await supabase
      .from('monthly_sets')
      .select('id, set_sessions(session_id)')
      .in('product_id', productIds);

    for (const set of (sets || []) as any[]) {
      monthSetIds.push(set.id);
      for (const ss of (set.set_sessions || [])) {
        if (ss.session_id) monthSessionIds.push(ss.session_id);
      }
    }
  }

  return {
    purchasedSessionIds: [...new Set([...sessionIds, ...monthSessionIds])],
    purchasedMonthSetIds: monthSetIds,
    hasYearly: false,
  };
}

// ---------------------------------------------------------------------------
// Yearly-month generation helper
// ---------------------------------------------------------------------------

const MONTH_NAMES_PL: Record<string, string> = {
  '01': 'Styczeń', '02': 'Luty', '03': 'Marzec', '04': 'Kwiecień',
  '05': 'Maj', '06': 'Czerwiec', '07': 'Lipiec', '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik', '11': 'Listopad', '12': 'Grudzień',
};

/** Generate YYYY-MM strings from 2024-05 to current_month + 11 */
function generateAllYearlyMonths(): string[] {
  const START = '2024-05';
  const now = new Date();
  const endYear = now.getMonth() + 11 >= 12
    ? now.getFullYear() + Math.floor((now.getMonth() + 11) / 12)
    : now.getFullYear();
  const endMonth = ((now.getMonth() + 11) % 12) + 1;
  const END = `${endYear}-${String(endMonth).padStart(2, '0')}`;

  const months: string[] = [];
  let [y, m] = START.split('-').map(Number);
  while (true) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(key);
    if (key === END) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function monthLabelToTitle(label: string): string {
  const [year, mm] = label.split('-');
  return `${MONTH_NAMES_PL[mm] || mm} ${year}`;
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
  const { data: yearlyProduct } = await supabase2.from('products').select('id').eq('slug', 'pakiet-roczny').single();

  const { data: sessionPrice } = await supabase2.from('prices').select('stripe_price_id, amount')
    .eq('product_id', sessionProduct?.id || '').eq('is_active', true).single();
  const { data: monthlyPrice } = await supabase2.from('prices').select('stripe_price_id, amount')
    .eq('product_id', monthlyProduct?.id || '').eq('is_active', true).single();
  const { data: yearlyPrice } = await supabase2.from('prices').select('stripe_price_id, amount')
    .eq('product_id', yearlyProduct?.id || '').eq('is_active', true).single();

  // Purchased sessions for logged-in user
  const { data: { user } } = await supabase2.auth.getUser();
  const purchased = user
    ? await getUserPurchased(supabase2, user.id)
    : { purchasedSessionIds: [], purchasedMonthSetIds: [], hasYearly: false };

  // Yearly: fetch user's purchased yearly months (scope_month on yearly entitlements)
  let purchasedYearlyMonths: string[] = [];
  if (user) {
    const { data: yearlyEnts } = await supabase2
      .from('entitlements')
      .select('scope_month')
      .eq('user_id', user.id)
      .eq('type', 'yearly')
      .eq('is_active', true)
      .gt('valid_until', new Date().toISOString())
      .not('scope_month', 'is', null);
    purchasedYearlyMonths = (yearlyEnts || []).map((e: any) => e.scope_month).filter(Boolean);
  }

  // Build monthly-set lookup by month_label for yearly grid
  const setsByMonth = new Map<string, typeof catalogData[number]>();

  const catalogData = monthlySets.map(ms => ({
    id: ms.id,
    title: ms.title,
    month_label: ms.month_label || '',
    sessions: ms.sessions.map((s: any) => ({
      id: s.id, title: s.title, description: s.description,
      category: s.category || 'grupowa', tags: s.tags || [], view_count: s.view_count || 0,
    })),
  }));

  for (const cd of catalogData) {
    if (cd.month_label) setsByMonth.set(cd.month_label, cd);
  }

  // Generate all yearly months from 2024-05 to current_month + 11
  const allYearlyMonthLabels = generateAllYearlyMonths();
  const allYearlyMonths = allYearlyMonthLabels.map(label => {
    const existing = setsByMonth.get(label);
    if (existing) return existing;
    // Placeholder for months without a monthly_set
    return {
      id: `placeholder-${label}`,
      title: monthLabelToTitle(label),
      month_label: label,
      sessions: [] as { id: string; title: string; description: string | null; category: string | null; tags: string[]; view_count: number }[],
    };
  });

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
        purchasedSessionIds={purchased.purchasedSessionIds}
        purchasedMonthSetIds={purchased.purchasedMonthSetIds}
        hasYearly={purchased.hasYearly}
        yearlyPrice={(yearlyPrice?.amount || 99900) / 100}
        yearlyPriceId={yearlyPrice?.stripe_price_id || ''}
        allYearlyMonths={allYearlyMonths}
        purchasedYearlyMonths={purchasedYearlyMonths}
      />
    </div>
  );
}
