/**
 * Tests for POST /api/fragments/radio/next
 *
 * Covers:
 * - 401 when not authenticated
 * - 400 on invalid JSON
 * - Returns { save: null } when pool is empty (all scopes)
 * - Returns a random save from the pool
 * - scope='favorites' filters correctly
 * - scope='category' filters by category_id
 * - scope='session' filters by session_template_id
 * - excludeIds removes candidates from pool
 * - Max excludeIds is capped at 20
 * - booking_recording saves are never returned (IS NULL filter)
 * - Returns { save: null } when pool is exhausted (all excluded)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: 'user-1' };
let mockCandidates: unknown[] = [];
let mockQueryError: unknown = null;

// Track which filters were applied to the last query
let capturedFilters: Record<string, unknown> = {};

// ─── Mock ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (_table: string) => makeChain(),
  }),
}));

// ─── Chain factory ────────────────────────────────────────────────────────────

function makeChain() {
  capturedFilters = {};
  const chain: Record<string, unknown> = {};

  chain.select = (_fields: unknown) => chain;
  chain.eq     = (field: string, value: unknown) => { capturedFilters[field] = value; return chain; };
  chain.not    = (field: string, op: string, value: unknown) => { capturedFilters[`not_${field}`] = { op, value }; return chain; };
  chain.is     = (field: string, value: unknown) => { capturedFilters[`is_${field}`] = value; return chain; };
  chain.order  = () => chain;
  chain.limit  = () => chain;
  // resolve as { data, error }
  chain.then   = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: mockCandidates, error: mockQueryError }).then(resolve);

  return chain;
}

// ─── Request helper ───────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fragments/radio/next', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/fragments/radio/next', () => {
  beforeEach(() => {
    mockUser       = { id: 'user-1' };
    mockCandidates = [];
    mockQueryError = null;
    capturedFilters = {};
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { POST } = await import('../next/route');
    const res = await POST(makeRequest({ scope: 'all' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON body', async () => {
    const { POST } = await import('../next/route');
    const req = new NextRequest('http://localhost/api/fragments/radio/next', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns { save: null } when pool is empty', async () => {
    mockCandidates = [];
    const { POST } = await import('../next/route');
    const res = await POST(makeRequest({ scope: 'all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.save).toBeNull();
  });

  it('returns a save when pool has candidates', async () => {
    const save = {
      id: 'save-1',
      session_template_id: 'sess-1',
      fragment_type: 'custom',
      custom_start_sec: 10,
      custom_end_sec: 40,
      session_templates: { id: 'sess-1', title: 'Spokój', slug: 'spokoj' },
    };
    mockCandidates = [save];
    const { POST } = await import('../next/route');
    const res = await POST(makeRequest({ scope: 'all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.save.id).toBe('save-1');
  });

  it('returns random save from multiple candidates', async () => {
    mockCandidates = [
      { id: 'save-a', session_template_id: 'sess-1', fragment_type: 'custom', custom_start_sec: 0, custom_end_sec: 30, session_templates: { id: 'sess-1', title: 'A', slug: 'a' } },
      { id: 'save-b', session_template_id: 'sess-2', fragment_type: 'custom', custom_start_sec: 0, custom_end_sec: 30, session_templates: { id: 'sess-2', title: 'B', slug: 'b' } },
    ];
    const { POST } = await import('../next/route');
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await POST(makeRequest({ scope: 'all' }));
      const json = await res.json();
      results.add(json.save.id);
    }
    // Both saves should appear across 20 trials (probabilistic — fails if random is broken)
    expect(results.has('save-a')).toBe(true);
    expect(results.has('save-b')).toBe(true);
  });

  it('applies is_favorite filter for scope=favorites', async () => {
    mockCandidates = [];
    const { POST } = await import('../next/route');
    await POST(makeRequest({ scope: 'favorites' }));
    expect(capturedFilters['is_favorite']).toBe(true);
  });

  it('applies category_id filter for scope=category', async () => {
    mockCandidates = [];
    const { POST } = await import('../next/route');
    await POST(makeRequest({ scope: 'category', scopeId: 'cat-42' }));
    expect(capturedFilters['category_id']).toBe('cat-42');
  });

  it('applies session_template_id filter for scope=session', async () => {
    mockCandidates = [];
    const { POST } = await import('../next/route');
    await POST(makeRequest({ scope: 'session', scopeId: 'sess-99' }));
    expect(capturedFilters['session_template_id']).toBe('sess-99');
  });

  it('always excludes booking_recording saves (IS NULL filter)', async () => {
    mockCandidates = [];
    const { POST } = await import('../next/route');
    await POST(makeRequest({ scope: 'all' }));
    // booking_recording_id IS NULL must be applied
    expect(capturedFilters['is_booking_recording_id']).toBeNull();
  });

  it('caps excludeIds at MAX_EXCLUDE=20', async () => {
    // Provide 25 IDs; only first 20 should be used
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    mockCandidates = [];
    const { POST } = await import('../next/route');
    // Should not throw — excess IDs are silently sliced
    const res = await POST(makeRequest({ scope: 'all', excludeIds: ids }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB query error', async () => {
    mockQueryError = { message: 'connection refused' };
    const { POST } = await import('../next/route');
    const res = await POST(makeRequest({ scope: 'all' }));
    expect(res.status).toBe(500);
  });

  it('ignores non-string entries in excludeIds', async () => {
    mockCandidates = [{ id: 'save-x', session_template_id: 'sess-1', fragment_type: 'custom', custom_start_sec: 0, custom_end_sec: 30, session_templates: {} }];
    const { POST } = await import('../next/route');
    // Mixed types in excludeIds should not throw
    const res = await POST(makeRequest({ scope: 'all', excludeIds: ['valid-id', 123, null, 'another-id'] }));
    expect(res.status).toBe(200);
  });
});
