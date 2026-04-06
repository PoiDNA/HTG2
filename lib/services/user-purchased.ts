import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserPurchased {
  /** Session IDs the user owns (individual + from monthly/yearly packages) */
  ownedSessionIds: string[];
  /** Monthly set IDs the user owns (from monthly + yearly entitlements) */
  ownedMonthSetIds: string[];
  /** Whether user has full yearly catalog access (all published months covered) */
  hasYearly: boolean;
}

/**
 * Determine which sessions and monthly sets a user has active entitlements for.
 * Used by both /sesje (catalog) and /konto (remaining sessions).
 */
export async function getUserPurchased(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPurchased> {
  const now = new Date().toISOString();

  // Fetch ALL active entitlements at once (session, monthly, yearly)
  const { data: allEnts } = await supabase
    .from('entitlements')
    .select('type, session_id, product_id, monthly_set_id, scope_month')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('valid_until', now);

  const entitlements = allEnts || [];

  // Individual session entitlements
  const sessionIds: string[] = entitlements
    .filter(e => e.type === 'session' && e.session_id)
    .map(e => e.session_id!);

  // Monthly + Yearly entitlements → collect monthly_set_ids
  const monthlyYearlyEnts = entitlements.filter(e => e.type === 'monthly' || e.type === 'yearly');

  // Collect monthly_set_ids directly from entitlements
  const directMonthSetIds: string[] = monthlyYearlyEnts
    .filter(e => e.monthly_set_id)
    .map(e => e.monthly_set_id!);

  // For monthly entitlements with product_id but no monthly_set_id → resolve via monthly_sets
  const productIds: string[] = monthlyYearlyEnts
    .filter(e => e.product_id && !e.monthly_set_id)
    .map(e => e.product_id!);

  let resolvedMonthSetIds: string[] = [];
  let monthSessionIds: string[] = [];

  if (productIds.length > 0) {
    const uniqueProductIds = [...new Set(productIds)];
    const { data: sets } = await supabase
      .from('monthly_sets')
      .select('id, set_sessions(session_id)')
      .in('product_id', uniqueProductIds);

    for (const set of (sets || []) as any[]) {
      resolvedMonthSetIds.push(set.id);
      for (const ss of (set.set_sessions || [])) {
        if (ss.session_id) monthSessionIds.push(ss.session_id);
      }
    }
  }

  // Also resolve sessions from directly-owned monthly sets
  if (directMonthSetIds.length > 0) {
    const uniqueSetIds = [...new Set(directMonthSetIds)];
    const { data: setSessionRows } = await supabase
      .from('set_sessions')
      .select('session_id')
      .in('set_id', uniqueSetIds);

    for (const r of (setSessionRows || [])) {
      if (r.session_id) monthSessionIds.push(r.session_id);
    }
  }

  const allMonthSetIds = [...new Set([...directMonthSetIds, ...resolvedMonthSetIds])];

  // Determine hasYearly: check if user's yearly entitlements cover ALL published months
  const yearlyEnts = entitlements.filter(e => e.type === 'yearly');
  let hasYearly = false;
  if (yearlyEnts.length > 0) {
    const { count } = await supabase
      .from('monthly_sets')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    const totalPublished = count ?? 0;
    // User has full access if yearly entitlements cover all published months
    hasYearly = totalPublished > 0 && allMonthSetIds.length >= totalPublished;
  }

  return {
    ownedSessionIds: [...new Set([...sessionIds, ...monthSessionIds])],
    ownedMonthSetIds: allMonthSetIds,
    hasYearly,
  };
}
