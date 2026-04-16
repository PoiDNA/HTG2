/**
 * lib/access/session-access.ts
 *
 * Session-template and fragment-feature entitlement helpers.
 * Used by fragment-token and access-check endpoint to determine
 * whether a user can play back a given session_template or use the
 * Fragments feature at all.
 *
 * Mirror of the entitlement logic in app/api/video/token/route.ts —
 * single source of truth for fragment flows. The VOD token route
 * keeps its own inline copy for safety (MVP); consolidation in v1.1.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Session-template access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `userId` has an active entitlement to play `sessionTemplateId`.
 *
 * Checks (in order):
 *   1. Direct session entitlement
 *   2. Monthly-set entitlement (set_sessions join)
 *   3. Legacy scope_month entitlement (monthly_set_id IS NULL)
 *
 * Always uses service-role client (caller must pass service-role supabase).
 * Admin bypass must be applied by the caller before calling this function.
 */
export async function userHasSessionAccess(
  userId: string,
  sessionTemplateId: string,
  db: SupabaseClient,
): Promise<boolean> {
  const now = new Date().toISOString();

  // 1. Direct session entitlement
  const { data: direct } = await db
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionTemplateId)
    .eq('is_active', true)
    .gt('valid_until', now)
    .limit(1)
    .maybeSingle();

  if (direct) return true;

  // 2. Find sets that include this session
  const { data: sessionSets } = await db
    .from('set_sessions')
    .select('set_id, monthly_set:monthly_sets(month_label)')
    .eq('session_id', sessionTemplateId);

  const setIds = (sessionSets ?? []).map((ss) => ss.set_id);
  if (setIds.length === 0) return false;

  // 3. Monthly/yearly entitlement for one of those sets
  const { data: setEnt } = await db
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .in('type', ['yearly', 'monthly'])
    .in('monthly_set_id', setIds)
    .eq('is_active', true)
    .gt('valid_until', now)
    .limit(1)
    .maybeSingle();

  if (setEnt) return true;

  // 4. Legacy fallback: scope_month match (monthly_set_id IS NULL)
  const setMonths = (sessionSets ?? [])
    .map((ss) => (ss as { monthly_set?: { month_label?: string } }).monthly_set?.month_label)
    .filter((m): m is string => !!m);

  if (setMonths.length === 0) return false;

  const { data: legacyEnt } = await db
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .in('type', ['yearly', 'monthly'])
    .is('monthly_set_id', null)
    .in('scope_month', setMonths)
    .eq('is_active', true)
    .gt('valid_until', now)
    .limit(1)
    .maybeSingle();

  return !!legacyEnt;
}

/**
 * Bulk variant — returns a Set of accessible session_template IDs.
 * Minimises round-trips for list screens with multiple sessions.
 */
export async function userHasSessionAccessBulk(
  userId: string,
  sessionTemplateIds: string[],
  db: SupabaseClient,
): Promise<Set<string>> {
  if (sessionTemplateIds.length === 0) return new Set();

  const now = new Date().toISOString();
  const accessible = new Set<string>();

  // Direct entitlements
  const { data: directs } = await db
    .from('entitlements')
    .select('session_id')
    .eq('user_id', userId)
    .in('session_id', sessionTemplateIds)
    .eq('is_active', true)
    .gt('valid_until', now);

  for (const d of directs ?? []) {
    if (d.session_id) accessible.add(d.session_id);
  }

  const remaining = sessionTemplateIds.filter((id) => !accessible.has(id));
  if (remaining.length === 0) return accessible;

  // Set-based entitlements for remaining sessions
  const { data: sessionSets } = await db
    .from('set_sessions')
    .select('session_id, set_id, monthly_set:monthly_sets(month_label)')
    .in('session_id', remaining);

  if (!sessionSets || sessionSets.length === 0) return accessible;

  const setIds = [...new Set(sessionSets.map((ss) => ss.set_id))];

  const { data: setEnts } = await db
    .from('entitlements')
    .select('id, monthly_set_id, scope_month, type')
    .eq('user_id', userId)
    .in('type', ['yearly', 'monthly'])
    .eq('is_active', true)
    .gt('valid_until', now);

  const entitledSetIds = new Set(
    (setEnts ?? [])
      .filter((e) => e.monthly_set_id && setIds.includes(e.monthly_set_id))
      .map((e) => e.monthly_set_id as string),
  );
  const entitledMonths = new Set(
    (setEnts ?? [])
      .filter((e) => !e.monthly_set_id && e.scope_month)
      .map((e) => e.scope_month as string),
  );

  for (const ss of sessionSets) {
    if (accessible.has(ss.session_id)) continue;

    const setMonth = (ss as { monthly_set?: { month_label?: string } }).monthly_set?.month_label;

    if (entitledSetIds.has(ss.set_id) || (setMonth && entitledMonths.has(setMonth))) {
      accessible.add(ss.session_id);
    }
  }

  return accessible;
}
