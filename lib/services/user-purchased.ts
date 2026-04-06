import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserPurchased {
  /** Session IDs the user owns (individual + from monthly/yearly packages) */
  ownedSessionIds: string[];
  /** Monthly set IDs the user owns (from monthly + yearly entitlements) */
  ownedMonthSetIds: string[];
  /** scope_month values from entitlements (for legacy filtering) */
  ownedScopeMonths: string[];
  /** Whether user has full yearly catalog access (all published months covered) */
  hasYearly: boolean;
}

/**
 * Determine which sessions and monthly sets a user has active entitlements for.
 * Resolves ownership via monthly_set_id (direct) and scope_month (legacy fallback).
 * Does NOT use product_id to resolve months — product_id is shared across all
 * monthly_sets and would incorrectly mark ALL months as owned.
 */
export async function getUserPurchased(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPurchased> {
  const now = new Date().toISOString();

  // Fetch ALL active entitlements at once
  const { data: allEnts } = await supabase
    .from('entitlements')
    .select('type, session_id, monthly_set_id, scope_month')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('valid_until', now);

  const entitlements = allEnts || [];

  // Individual session entitlements
  const sessionIds: string[] = entitlements
    .filter(e => e.type === 'session' && e.session_id)
    .map(e => e.session_id!);

  // Monthly + Yearly entitlements
  const monthlyYearlyEnts = entitlements.filter(e => e.type === 'monthly' || e.type === 'yearly');

  // 1. Collect monthly_set_ids directly from entitlements (primary)
  const directMonthSetIds: string[] = monthlyYearlyEnts
    .filter(e => e.monthly_set_id)
    .map(e => e.monthly_set_id!);

  // 2. Collect scope_months (legacy fallback — entitlements without monthly_set_id)
  const scopeMonths: string[] = monthlyYearlyEnts
    .filter(e => e.scope_month)
    .map(e => e.scope_month!);

  // 3. Resolve scope_months → monthly_set IDs via month_label
  let resolvedFromScopeIds: string[] = [];
  const scopeMonthsWithoutSetId = monthlyYearlyEnts
    .filter(e => e.scope_month && !e.monthly_set_id)
    .map(e => e.scope_month!);

  if (scopeMonthsWithoutSetId.length > 0) {
    const uniqueScopes = [...new Set(scopeMonthsWithoutSetId)];
    const { data: resolvedSets } = await supabase
      .from('monthly_sets')
      .select('id')
      .in('month_label', uniqueScopes);

    resolvedFromScopeIds = (resolvedSets || []).map(s => s.id);
  }

  // Combine all owned monthly set IDs
  const allMonthSetIds = [...new Set([...directMonthSetIds, ...resolvedFromScopeIds])];

  // Resolve sessions from owned monthly sets
  let monthSessionIds: string[] = [];
  if (allMonthSetIds.length > 0) {
    const { data: setSessionRows } = await supabase
      .from('set_sessions')
      .select('session_id')
      .in('set_id', allMonthSetIds);

    monthSessionIds = (setSessionRows || []).map(r => r.session_id).filter(Boolean);
  }

  // Determine hasYearly: all published months covered
  let hasYearly = false;
  const yearlyEnts = entitlements.filter(e => e.type === 'yearly');
  if (yearlyEnts.length > 0) {
    const { count } = await supabase
      .from('monthly_sets')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    const totalPublished = count ?? 0;
    hasYearly = totalPublished > 0 && allMonthSetIds.length >= totalPublished;
  }

  return {
    ownedSessionIds: [...new Set([...sessionIds, ...monthSessionIds])],
    ownedMonthSetIds: allMonthSetIds,
    ownedScopeMonths: [...new Set(scopeMonths)],
    hasYearly,
  };
}
