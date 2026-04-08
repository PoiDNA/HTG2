import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { RateLimitAction, RateLimitActionConfig } from './types';

/**
 * Rate-limit config per action.
 * Search uses a short burst window (10 min) to stay friendly to autocomplete
 * typing while still blocking enumeration. Mutations use a 60 min window.
 */
export const RATE_LIMIT_CONFIG: Record<RateLimitAction, RateLimitActionConfig> = {
  admin_user_search:        { max: 40,  windowMinutes: 10 },
  recordings_participants:  { max: 60,  windowMinutes: 60 },
  recordings_assign_single: { max: 30,  windowMinutes: 60 },
  recordings_assign_bulk:   { max: 10,  windowMinutes: 60 },
  recordings_remove_access: { max: 30,  windowMinutes: 60 },
};

/**
 * Returns true if the user is OVER the limit (should be blocked).
 *
 * Fail-open on any Supabase error (missing table, RLS, network, timeout) —
 * logged to console.error so it surfaces in Vercel logs / Sentry (if the
 * project has `Sentry.captureConsoleIntegration` or a log drain).
 *
 * Rate limit is a defensive layer; auth + scope remain the primary gate.
 * If a hard block guarantee is ever required, flip both `catch` returns
 * from `false` → `true` (fail-closed).
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
): Promise<boolean> {
  const { max, windowMinutes } = RATE_LIMIT_CONFIG[action];
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  try {
    const db = createSupabaseServiceRole();
    const { count, error } = await db
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action_type', action)
      .gte('created_at', since);

    if (error) {
      console.error('[rate-limit] check failed', {
        action,
        userId,
        error: error.message,
      });
      return false; // fail-open
    }
    return (count ?? 0) >= max;
  } catch (err) {
    console.error('[rate-limit] check threw', { action, userId, err });
    return false; // fail-open (e.g. missing table, RLS, network)
  }
}

/**
 * Slot-reservation log. Fire immediately after a successful `checkRateLimit`,
 * BEFORE any work — this is anti-enumeration semantics, NOT the
 * community-style "log on success" pattern in `lib/community/rate-limit.ts`.
 *
 * Best-effort: never throws. Insert failure is logged but does not block
 * the caller's response. Silent failure = local bypass of the limit for
 * that user (or globally at scale) — monitor via `[rate-limit] log insert
 * failed` error rate.
 */
export async function logRateLimitAction(
  userId: string,
  action: RateLimitAction,
): Promise<void> {
  try {
    const db = createSupabaseServiceRole();
    const { error } = await db
      .from('api_rate_limits')
      .insert({ user_id: userId, action_type: action });
    if (error) {
      console.error('[rate-limit] log insert failed', {
        action,
        userId,
        error: error.message,
      });
    }
  } catch (err) {
    console.error('[rate-limit] log threw', { action, userId, err });
  }
}
