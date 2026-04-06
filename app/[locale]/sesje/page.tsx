import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { MONTH_NAMES_PL } from '@/lib/booking/constants';
import { getMonthlySets } from '@/lib/services/monthly-sets';
import { getUserPurchased } from '@/lib/services/user-purchased';
import { getSessionPrices } from '@/lib/services/session-prices';
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
// Data fetching (shared helpers in lib/services/)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Yearly-month generation helper
// ---------------------------------------------------------------------------

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

  // Fetch prices from shared helper
  const prices = await getSessionPrices();

  // Purchased sessions for logged-in user
  const supabase2 = await createSupabaseServer();
  const { data: { user } } = await supabase2.auth.getUser();
  const purchased = user
    ? await getUserPurchased(supabase2, user.id)
    : { ownedSessionIds: [], ownedMonthSetIds: [], hasYearly: false };

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
          sessionPriceId: prices.sessionPriceId,
          sessionAmount: (prices.sessionAmount || 3000) / 100,
          monthlyPriceId: prices.monthlyPriceId,
          monthlyAmount: (prices.monthlyAmount || 9900) / 100,
        }}
        purchasedSessionIds={purchased.ownedSessionIds}
        purchasedMonthSetIds={purchased.ownedMonthSetIds}
        hasYearly={purchased.hasYearly}
        yearlyPrice={(prices.yearlyAmount || 99900) / 100}
        yearlyPriceId={prices.yearlyPriceId}
        allYearlyMonths={allYearlyMonths}
        purchasedYearlyMonths={purchasedYearlyMonths}
      />
    </div>
  );
}
