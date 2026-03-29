import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { RateLimitAction } from './types';

/**
 * Rate limits per action type (per hour).
 */
const RATE_LIMITS: Record<RateLimitAction, number> = {
  post: 10,
  comment: 30,
  reaction: 120,
  report: 5,
};

/**
 * Check if a user has exceeded the rate limit for a given action.
 * Returns true if rate-limited (should be blocked).
 */
export async function checkCommunityRateLimit(
  userId: string,
  actionType: RateLimitAction
): Promise<boolean> {
  const limit = RATE_LIMITS[actionType];
  const db = createSupabaseServiceRole();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await db
    .from('community_rate_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .gte('created_at', since);

  return (count ?? 0) >= limit;
}

/**
 * Log a community action for rate limiting purposes.
 */
export async function logCommunityAction(
  userId: string,
  actionType: RateLimitAction
): Promise<void> {
  const db = createSupabaseServiceRole();
  await db
    .from('community_rate_log')
    .insert({
      user_id: userId,
      action_type: actionType,
    });
}
