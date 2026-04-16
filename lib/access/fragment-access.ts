/**
 * lib/access/fragment-access.ts
 *
 * Fragment feature-gate helpers.
 *
 * The Fragments feature (saves, playback, radio, sharing) is an optional paid
 * add-on, orthogonal to session-content access. A user needs BOTH:
 *   1. fragment_access entitlement  — can use the Fragments feature at all
 *   2. session / recording access   — can play back the underlying media
 *
 * Admin always bypasses both gates.
 *
 * DB model: entitlements(type='feature', feature_key='fragments', is_active,
 *   valid_until). Created by Stripe webhook or admin manual grant.
 *
 * Impulse list (GET /api/fragments/impulses) is intentionally excluded from
 * the gate — users without access can browse the list as a marketing teaser.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns true if `userId` has an active fragment feature entitlement.
 * Caller is responsible for admin bypass (pass isAdmin=true to short-circuit).
 *
 * Always uses service-role client.
 */
export async function userHasFragmentAccess(
  userId: string,
  db: SupabaseClient,
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data } = await db
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'feature')
    .eq('feature_key', 'fragments')
    .eq('is_active', true)
    .gt('valid_until', now)
    .limit(1)
    .maybeSingle();

  return !!data;
}

/**
 * Combined access check: fragment feature + session-template content.
 * Use in fragment-token (VOD branch) to avoid two separate round-trips
 * when both checks are needed.
 *
 * Returns:
 *   { fragmentAccess: boolean, sessionAccess: boolean }
 *
 * Admin bypass: caller should skip this function entirely and treat both as true.
 */
export async function checkFragmentAndSessionAccess(
  userId: string,
  sessionTemplateId: string,
  db: SupabaseClient,
): Promise<{ fragmentAccess: boolean; sessionAccess: boolean }> {
  // Run both checks in parallel
  const [fragmentResult, sessionResult] = await Promise.all([
    userHasFragmentAccess(userId, db),
    import('./session-access').then((m) => m.userHasSessionAccess(userId, sessionTemplateId, db)),
  ]);

  return {
    fragmentAccess: fragmentResult,
    sessionAccess: sessionResult,
  };
}
