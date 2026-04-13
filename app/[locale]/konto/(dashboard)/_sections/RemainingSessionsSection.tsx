import { getEffectiveUser } from '@/lib/admin/effective-user';
import { getMonthlySets } from '@/lib/services/monthly-sets';
import { getUserPurchased } from '@/lib/services/user-purchased';
import { getSessionPrices } from '@/lib/services/session-prices';
import RemainingSessionsClient from './RemainingSessionsClient';

/**
 * Server component: fetches unpurchased months/sessions and renders the shop section.
 * Returns null if user has full catalog access or owns everything.
 */
export default async function RemainingSessionsSection({ locale }: { locale: string }) {
  try {
    const { userId, supabase } = await getEffectiveUser();
    const [allSets, purchased, prices] = await Promise.all([
      getMonthlySets(locale),
      getUserPurchased(supabase, userId),
      getSessionPrices(),
    ]);

    // Full catalog access → nothing to show
    if (purchased.hasYearly) return null;

    const ownedSessionSet = new Set(purchased.ownedSessionIds);
    const ownedMonthSet = new Set(purchased.ownedMonthSetIds);
    const ownedScopeSet = new Set(purchased.ownedScopeMonths);

    // Filter to months/sessions user doesn't own
    const remainingMonths = allSets
      .filter(set => {
        if (!set.month_label) return false;
        if (ownedMonthSet.has(set.id)) return false;
        if (ownedScopeSet.has(set.month_label)) return false;
        return true;
      })
      .map(set => {
        const remainingSessions = set.sessions.filter(s => !ownedSessionSet.has(s.id));
        return {
          id: set.id,
          title: set.title,
          monthLabel: set.month_label!,
          coverImageUrl: set.cover_image_url || null,
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
