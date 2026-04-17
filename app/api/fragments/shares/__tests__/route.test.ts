/**
 * Tests for GET+POST /api/fragments/shares and GET /api/fragments/shares/by-token/[token]
 *
 * Covers:
 * - 401 when not authenticated
 * - POST: category ownership check
 * - POST: blocks shares when category contains booking_recording saves (API guard)
 * - POST: 409 on duplicate recipient share (DB 23505)
 * - POST: 201 on valid share creation (link-only + direct recipient)
 * - GET: returns active shares for owner
 * - by-token: 429 when rate limited
 * - by-token: 404 for missing/revoked/expired share
 * - by-token: 404 when recipient restriction doesn't match
 * - by-token: 200 field allowlist (no owner PII)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string; email: string } | null = { id: 'user-1', email: 'user@example.com' };
let mockCategory: { id: string; user_id: string } | null = { id: 'cat-1', user_id: 'user-1' };
let mockRecordingCount = 0;
let mockShareInsertResult: { data: unknown; error: unknown } = {
  data: { id: 'share-1', share_token: 'tok-abc', category_id: 'cat-1', recipient_user_id: null, can_resave: false, expires_at: null, created_at: '2026-01-01' },
  error: null,
};
let mockSharesList: unknown[] = [];

// by-token mocks
let mockRateLimited = false;
let mockShareByToken: Record<string, unknown> | null = {
  id: 'share-1',
  category_id: 'cat-1',
  owner_user_id: 'owner-1',
  recipient_user_id: null,
  can_resave: false,
  expires_at: null,
  revoked_at: null,
};
let mockCategory2: { id: string; name: string; color: string | null } | null = { id: 'cat-1', name: 'Medytacje', color: '#4f46e5' };

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => makeServerChain(table),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => ({
    from: (table: string) => makeServiceChain(table),
  }),
}));

vi.mock('@/lib/rate-limit/check', () => ({
  checkRateLimit: async () => mockRateLimited,
  logRateLimitAction: async () => undefined,
}));

// ─── Chain helpers ────────────────────────────────────────────────────────────

function makeServerChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq     = self;
  chain.is     = self;
  chain.order  = self;
  chain.single = async () => ({ data: mockCategory, error: null });
  chain.range  = async () => ({ data: mockSharesList, error: null });
  // Thenable — for `await supabase.from('category_shares').select(...).eq(...).is(...).order(...)` in GET
  chain.then   = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: mockSharesList, error: null }).then(resolve, reject);
  return chain;
}

function makeServiceChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain.select  = self;
  chain.eq      = self;
  chain.is      = self;
  chain.not     = self;
  chain.order   = self;
  chain.limit   = self;
  chain.insert  = () => insertChain();
  chain.update  = self;

  // single / maybeSingle dispatch by table
  chain.single = async () => {
    if (table === 'user_categories') return { data: mockCategory, error: null };
    if (table === 'category_shares') return { data: mockShareByToken, error: null };
    return { data: null, error: null };
  };
  chain.maybeSingle = async () => ({ data: null, error: null });

  // For recording count check: POST /shares does:
  //   db.from('user_fragment_saves').select('*', { count: 'exact', head: true }).eq(...).not(...)
  // select() receives (fields, opts) — second arg has count:'exact'
  const originalSelect = (_fields?: unknown, opts?: unknown) => {
    if (opts && typeof opts === 'object' && (opts as Record<string, unknown>)['count'] === 'exact') {
      // Recording count query — return thenable with mockRecordingCount
      const countChain: Record<string, unknown> = {};
      const countSelf = () => countChain;
      countChain.eq    = countSelf;
      countChain.not   = countSelf;
      countChain.is    = countSelf;
      countChain.limit = countSelf;
      countChain.then  = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ count: mockRecordingCount, data: null, error: null }).then(resolve);
      return countChain;
    }
    return chain;
  };
  chain.select = originalSelect;

  return chain;
}

function insertChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.single = async () => mockShareInsertResult;
  return chain;
}

// ─── Request helpers ─────────────────────────────────────────────────────────

function makeShareRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fragments/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/fragments/shares', { method: 'GET' });
}

function makeTokenRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/fragments/shares/by-token/${token}`);
}

// ─── Tests: POST /api/fragments/shares ───────────────────────────────────────

describe('POST /api/fragments/shares', () => {
  beforeEach(() => {
    mockUser              = { id: 'user-1', email: 'user@example.com' };
    mockCategory          = { id: 'cat-1', user_id: 'user-1' };
    mockRecordingCount    = 0;
    mockShareInsertResult = {
      data: { id: 'share-1', share_token: 'tok-abc', category_id: 'cat-1', recipient_user_id: null, can_resave: false, expires_at: null, created_at: '2026-01-01' },
      error: null,
    };
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when category_id missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/category_id required/);
  });

  it('returns 404 when category does not belong to user', async () => {
    mockCategory = null; // ownership check fails
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 (cannot_share_recording_category) when category has booking_recording saves', async () => {
    mockRecordingCount = 1;
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('cannot_share_recording_category');
  });

  it('returns 201 on valid link-only share creation', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.share.share_token).toBe('tok-abc');
    expect(json.share.recipient_user_id).toBeNull();
  });

  it('returns 201 on direct share with recipient', async () => {
    mockShareInsertResult = {
      data: { id: 'share-2', share_token: 'tok-xyz', category_id: 'cat-1', recipient_user_id: 'user-2', can_resave: true, expires_at: null, created_at: '2026-01-01' },
      error: null,
    };
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1', recipient_user_id: 'user-2', can_resave: true }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.share.recipient_user_id).toBe('user-2');
    expect(json.share.can_resave).toBe(true);
  });

  it('returns 409 on duplicate recipient (DB 23505)', async () => {
    mockShareInsertResult = { data: null, error: { code: '23505', message: 'duplicate' } };
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1', recipient_user_id: 'user-2' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/);
  });

  it('returns 400 when DB trigger rejects share (check_violation)', async () => {
    mockShareInsertResult = { data: null, error: { code: 'check_violation', message: 'booking-recording' } };
    const { POST } = await import('../route');
    const res = await POST(makeShareRequest({ category_id: 'cat-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('cannot_share_recording_category');
  });
});

// ─── Tests: GET /api/fragments/shares ────────────────────────────────────────

describe('GET /api/fragments/shares', () => {
  beforeEach(() => {
    mockUser       = { id: 'user-1', email: 'user@example.com' };
    mockSharesList = [];
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { GET } = await import('../route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns empty shares array when user has none', async () => {
    mockSharesList = [];
    const { GET } = await import('../route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shares).toEqual([]);
  });

  it('returns shares list for authenticated owner', async () => {
    mockSharesList = [
      { id: 'share-1', share_token: 'tok-1', category_id: 'cat-1', recipient_user_id: null, can_resave: false, expires_at: null, revoked_at: null, created_at: '2026-01-01', user_categories: { name: 'Test', color: null } },
    ];
    const { GET } = await import('../route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shares).toHaveLength(1);
    expect(json.shares[0].id).toBe('share-1');
  });
});

// ─── Tests: GET /api/fragments/shares/by-token/[token] ───────────────────────

describe('GET /api/fragments/shares/by-token/[token]', () => {
  beforeEach(() => {
    mockUser         = { id: 'user-1', email: 'user@example.com' };
    mockRateLimited  = false;
    mockShareByToken = {
      id: 'share-1',
      category_id: 'cat-1',
      owner_user_id: 'owner-1',
      recipient_user_id: null,
      can_resave: false,
      expires_at: null,
      revoked_at: null,
    };
    mockCategory2 = { id: 'cat-1', name: 'Medytacje', color: '#4f46e5' };
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimited = true;
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(429);
  });

  it('returns 404 when share not found', async () => {
    mockShareByToken = null;
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-bad'), { params: Promise.resolve({ token: 'tok-bad' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when share is expired', async () => {
    mockShareByToken = {
      ...mockShareByToken,
      expires_at: '2020-01-01T00:00:00Z', // in the past
      revoked_at: null,
    };
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/expired/);
  });

  it('returns 404 when direct share recipient does not match user', async () => {
    mockShareByToken = { ...mockShareByToken, recipient_user_id: 'user-other' };
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 with field allowlist (no owner PII)', async () => {
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    // Field allowlist enforced — no owner_user_id, no owner email
    expect(json.share.id).toBe('share-1');
    expect(json.share.category_name).toBeDefined();
    expect(json.share).not.toHaveProperty('owner_user_id');
    expect(json.share).not.toHaveProperty('owner_email');
    expect(json).toHaveProperty('saves');
    expect(Array.isArray(json.saves)).toBe(true);
  });

  it('allows direct recipient share when user matches', async () => {
    mockShareByToken = { ...mockShareByToken, recipient_user_id: 'user-1' }; // matches mockUser.id
    const { GET } = await import('../by-token/[token]/route');
    const res = await GET(makeTokenRequest('tok-abc'), { params: Promise.resolve({ token: 'tok-abc' }) });
    expect(res.status).toBe(200);
  });
});
