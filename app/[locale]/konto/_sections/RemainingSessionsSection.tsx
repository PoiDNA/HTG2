import { getEffectiveUser } from '@/lib/admin/effective-user';
import { getMonthlySets } from '@/lib/services/monthly-sets';
import { getUserPurchased } from '@/lib/services/user-purchased';
import { getSessionPrices } from '@/lib/services/session-prices';
import RemainingSessionsClient from './RemainingSessionsClient';

/**
 * Server component: fetches unpurchased months/sessions and renders the shop section.
 * Returns null if user has full catalog access or owns everything.
 * Wrapped in try/catch to never crash inside Suspense.
 */
export default async function RemainingSessionsSection({ locale }: { locale: string }) {
  try {
    const { userId, supabase } = await getEffectiveUser();
    const [allSets, purchased, prices] = await Promise.all([
      getMonthlySets(),
      getUserPurchased(supabase, userId),
      getSessionPrices(),
    ]);

    // Full catalog access → nothing to show
    if (purchased.hasYearly) return null;

    const ownedSessionSet = new Set(purchased.ownedSessionIds);
    const ownedMonthSet = new Set(purchased.ownedMonthSetIds);

    // Also check scope_month ownership (legacy entitlements without monthly_set_id)
    const ownedScopeMonths = new Set<string>();
    // getUserPurchased doesn't return scope_months yet, so we fetch them directly
    const { data: scopeEnts } = await supabase
      .from('entitlements')
      .select('scope_month')
      .eq('user_id', userId)
      .in('type', ['monthly', 'yearly'])
      .eq('is_active', true)
      .gt('valid_until', new Date().toISOString())
      .not('scope_month', 'is', null);
    for (const e of scopeEnts || []) {
      if (e.scope_month) ownedScopeMonths.add(e.scope_month);
    }

    // Filter to months/sessions user doesn't own
    const remainingMonths = allSets
      .filter(set => {
        if (!set.month_label) return false;
        // Owned by monthly_set_id OR by scope_month (legacy)
        if (ownedMonthSet.has(set.id)) return false;
        if (ownedScopeMonths.has(set.month_label)) return false;
        return true;
      })
      .map(set => {
        const remainingSessions = set.sessions.filter(s => !ownedSessionSet.has(s.id));
        return {
          id: set.id,
          title: set.title,
          monthLabel: set.month_label!,
          sessions: remainingSessions.map(s => ({
            id: s.id,
            title: s.title,
            description: s.description,
            durationMinutes: s.duration_minutes,
          })),
          totalSessionsInSet: set.sessions.length,
        };
      })
      .filter(m => m.sessions.length > 0);

    if (remainingMonths.length === 0) return null;

    return (
      <RemainingSessionsClient
        months={remainingMonths}
        prices={{
          sessionPriceId: prices.sessionPriceId,
          sessionAmount: prices.sessionAmount,
          monthlyPriceId: prices.monthlyPriceId,
          monthlyAmount: prices.monthlyAmount,
        }}
      />
    );
  } catch (err) {
    console.error('RemainingSessionsSection error:', err);
    return null;
  }
}
