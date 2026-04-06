import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserPurchased {
  /** Session IDs the user owns (individual + from monthly packages) */
  ownedSessionIds: string[];
  /** Monthly set IDs the user owns */
  ownedMonthSetIds: string[];
  /** Whether user has full yearly catalog access */
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

  // Check yearly (full-catalog) subscription
  const { data: yearlyEnt } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'yearly')
    .eq('is_active', true)
    .gt('valid_until', now)
    .maybeSingle();

  if (yearlyEnt) {
    return { ownedSessionIds: [], ownedMonthSetIds: [], hasYearly: true };
  }

  // Individual session entitlements
  const { data: sessionEnts } = await supabase
    .from('entitlements')
    .select('session_id')
    .eq('user_id', userId)
    .eq('type', 'session')
    .eq('is_active', true)
    .gt('valid_until', now)
    .not('session_id', 'is', null);

  const sessionIds: string[] = (sessionEnts || []).map((e: any) => e.session_id);

  // Monthly package entitlements → resolve which sets + their sessions
  const { data: monthlyEnts } = await supabase
    .from('entitlements')
    .select('product_id')
    .eq('user_id', userId)
    .eq('type', 'monthly')
    .eq('is_active', true)
    .gt('valid_until', now)
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
    ownedSessionIds: [...new Set([...sessionIds, ...monthSessionIds])],
    ownedMonthSetIds: monthSetIds,
    hasYearly: false,
  };
}
