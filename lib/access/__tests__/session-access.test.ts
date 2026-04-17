/**
 * Tests for lib/access/session-access.ts
 *
 * Covers:
 * - userHasSessionAccess: direct / set-based / legacy scope_month / no access
 * - userHasSessionAccessBulk: empty input / direct / set-based / mixed
 */

import { describe, it, expect } from 'vitest';
import { userHasSessionAccess, userHasSessionAccessBulk } from '../session-access';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Mock DB factory ─────────────────────────────────────────────────────────

type TableResult = { data: unknown; error?: unknown };

/**
 * Builds a mock Supabase client.
 *
 * Each table entry may be:
 *   - a single result object  → used for every call to that table
 *   - an array                → results are consumed in order (first call → results[0], etc.)
 *
 * The returned query chain is thenable so that bare `await db.from(t).select(...).eq(...)`
 * resolves correctly (no `.single()` needed). `.single()` and `.maybeSingle()` also resolve.
 */
function makeDb(tableResults: Record<string, TableResult | TableResult[]>) {
  const callCounts: Record<string, number> = {};

  return {
    from(table: string) {
      if (!(table in callCounts)) callCounts[table] = 0;
      const results = tableResults[table] ?? { data: null };

      const getResult = (): TableResult => {
        if (Array.isArray(results)) {
          const idx = callCounts[table]++;
          return results[idx] ?? { data: null };
        }
        return results as TableResult;
      };

      const chain: Record<string, unknown> = {};
      const returnSelf = () => chain;

      chain.select      = returnSelf;
      chain.eq          = returnSelf;
      chain.in          = returnSelf;
      chain.not         = returnSelf;
      chain.is          = returnSelf;
      chain.gt          = returnSelf;
      chain.limit       = returnSelf;
      chain.order       = returnSelf;
      // Thenable — so `await db.from(t).select(...)` works without .single()
      chain.then        = (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(getResult()).then(resolve, reject);
      chain.maybeSingle = async () => getResult();
      chain.single      = async () => getResult();
      chain.range       = async () => getResult();

      return chain;
    },
  } as unknown as SupabaseClient;
}

// ─── userHasSessionAccess ────────────────────────────────────────────────────

const SESSION_ID = 'sess-111';
const USER_ID    = 'user-aaa';

describe('userHasSessionAccess', () => {
  it('returns true on direct entitlement', async () => {
    const db = makeDb({
      entitlements: { data: { id: 'ent-1' } },  // direct hit
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(true);
  });

  it('returns true on monthly-set entitlement', async () => {
    const db = makeDb({
      entitlements: [
        { data: null },                          // direct miss
        { data: { id: 'ent-set' } },             // set-based hit
      ],
      set_sessions: { data: [{ set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(true);
  });

  it('returns true on legacy scope_month entitlement', async () => {
    const db = makeDb({
      entitlements: [
        { data: null },                          // direct miss
        { data: null },                          // set-based miss
        { data: { id: 'ent-legacy' } },          // legacy hit
      ],
      set_sessions: { data: [{ set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(true);
  });

  it('returns false when session belongs to no sets', async () => {
    const db = makeDb({
      entitlements: { data: null },              // direct miss
      set_sessions: { data: [] },               // session in no sets → short-circuit false
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(false);
  });

  it('returns false when user has no matching entitlement', async () => {
    const db = makeDb({
      entitlements: [
        { data: null },                          // direct miss
        { data: null },                          // set-based miss
        { data: null },                          // legacy miss
      ],
      set_sessions: { data: [{ set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(false);
  });

  it('returns false when set has no month_label (legacy path skipped)', async () => {
    const db = makeDb({
      entitlements: [
        { data: null },                          // direct miss
        { data: null },                          // set-based miss
        // legacy path: setMonths empty → returns false without query
      ],
      set_sessions: { data: [{ set_id: 'set-1', monthly_set: null }] },
    });
    const result = await userHasSessionAccess(USER_ID, SESSION_ID, db);
    expect(result).toBe(false);
  });
});

// ─── userHasSessionAccessBulk ────────────────────────────────────────────────

describe('userHasSessionAccessBulk', () => {
  it('returns empty set for empty input (no queries)', async () => {
    // No DB calls expected — function short-circuits
    const db = makeDb({});
    const result = await userHasSessionAccessBulk(USER_ID, [], db);
    expect(result.size).toBe(0);
  });

  it('returns accessible set from direct entitlements', async () => {
    const db = makeDb({
      entitlements: { data: [{ session_id: 'sess-a' }, { session_id: 'sess-b' }] },
      set_sessions: { data: [] },                // no set-based needed (remaining = [sess-c])
    });
    const result = await userHasSessionAccessBulk(USER_ID, ['sess-a', 'sess-b', 'sess-c'], db);
    expect(result.has('sess-a')).toBe(true);
    expect(result.has('sess-b')).toBe(true);
    expect(result.has('sess-c')).toBe(false);
  });

  it('adds set-based accessible sessions to result', async () => {
    const db = makeDb({
      entitlements: [
        { data: [] },                            // direct: none
        { data: [{ id: 'e1', monthly_set_id: 'set-1', scope_month: null, type: 'monthly' }] }, // set ents
      ],
      set_sessions: { data: [{ session_id: 'sess-x', set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccessBulk(USER_ID, ['sess-x'], db);
    expect(result.has('sess-x')).toBe(true);
  });

  it('resolves legacy scope_month for remaining sessions', async () => {
    const db = makeDb({
      entitlements: [
        { data: [] },                            // direct: none
        { data: [{ id: 'e1', monthly_set_id: null, scope_month: '2025-01', type: 'monthly' }] }, // legacy
      ],
      set_sessions: { data: [{ session_id: 'sess-y', set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccessBulk(USER_ID, ['sess-y'], db);
    expect(result.has('sess-y')).toBe(true);
  });

  it('returns empty set when user has no entitlements at all', async () => {
    const db = makeDb({
      entitlements: [
        { data: [] },                            // direct: none
        { data: [] },                            // set ents: none
      ],
      set_sessions: { data: [{ session_id: 'sess-z', set_id: 'set-1', monthly_set: { month_label: '2025-01' } }] },
    });
    const result = await userHasSessionAccessBulk(USER_ID, ['sess-z'], db);
    expect(result.has('sess-z')).toBe(false);
  });
});
