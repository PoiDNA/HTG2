import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve whether a user is entitled to a given session.
 *
 * Placeholder for MOB-SPIKE-05 Path A. Once the `entitlements` table from
 * ADR 001 is in place, this reads from `user_effective_tier(user_id)` and
 * compares against `sessions.required_tier`. Until then: free sessions are
 * open, paid sessions require any active Stripe subscription.
 */
export async function isSessionEntitled(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { data: session } = await admin
    .from('sessions')
    .select('id, required_tier')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return false;
  if (!session.required_tier || session.required_tier === 'free') return true;

  const { data: sub } = await admin
    .from('stripe_subscriptions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  return !!sub;
}
