/**
 * Tests for GET /api/fragments/shares (list) and POST /api/fragments/shares (create)
 *
 * Covers:
 * - 401 when not authenticated
 * - POST: requires category_id
 * - POST: 404 when category doesn't belong to user
 * - POST: 400 (cannot_share_recording_category) when category has booking_recording saves — API guard
 * - POST: 400 when DB trigger rejects (check_violation — fail-safe path)
 * - POST: 409 on duplicate recipient share (DB 23505)
 * - POST: 201 link-only share
 * - POST: 201 direct share with recipient + can_resave
 * - GET: 401 when not authenticated
 * - GET: returns empty array
 * - GET: returns list of active shares
 *
 * by-token tests live in by-token/[token]/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string; email: string } | null = { id: 'user-1', email: 'user@example.com' };
let mockCategory: { id: string; user_id: string } | null = { id: 'cat-1', user_id: 'user-1' };
let mockRecordingCount = 0;
let mockShareInsertResult: { data: unknown; error: unknown } = {
  data: {
    id: 'share-1', share_token: 'tok-abc', category_id: 'cat-1',
    recipient_user_id: null, can_resave: false, expires_at: null, created_at: '2026-01-01',
  },
  error: null,
};
let mockSharesList: unknown[] = [];

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => makeServerChain(table),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => ({ from: (table: string) => makeServiceChain(table) }),
}));

// ─── Chain helpers ────────────────────────────────────────────────────────────

function makeServerChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select  = self;
  chain.eq      = self;
  chain.is      = self;
  chain.order   = self;
  chain.single  = async () => ({ data: mockCategory, error: null });
  // Thenable for `await supabase.from('category_shares').select(...).eq(...).is(...).order(...)`
  chain.then    = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: mockSharesList, error: null }).then(resolve, reject);
  return chain;
}

function makeServiceChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  // Default select (non-count)
  chain.select = (_fields?: unknown, opts?: unknown) => {
    if (opts && typeof opts === 'object' && (opts as Record<string, unknown>)['count'] === 'exact') {
      // Recording count query — thenable with count
      const countChain: Record<string, unknown> = {};
      const cs = () => countChain;
      countChain.eq    = cs;
      countChain.not   = cs;
      countChain.is    = cs;
      countChain.limit = cs;
      countChain.then  = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ count: mockRecordingCount, data: null, error: null }).then(resolve);
      return countChain;
    }
    return chain;
  };

  chain.eq     = self;
  chain.is     = self;
  chain.not    = self;
  chain.order  = self;
  chain.insert = () => insertChain();

  chain.single = async () => {
    if (table === 'user_categories') return { data: mockCategory, error: null };
    return { data: null, error: null };
  };
  chain.maybeSingle = async () => ({ data: null, error: null });

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

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fragments/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(): NextRequest {
  return new NextRequest('http://localhost/api/fragments/shares', { method: 'GET' });
}

// ─── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/fragments/shares', () => {
  beforeEach(() => {
    mockUser              = { id: 'user-1', email: 'user@example.com' };
    mockCategory          = { id: 'cat-1', user_id: 'user-1' };
    mockRecordingCount    = 0;
    mockShareInsertResult = {
      data: {
        id: 'share-1', share_token: 'tok-abc', category_id: 'cat-1',
        recipient_user_id: null, can_resave: false, expires_at: null, created_at: '2026-01-01',
      },
      error: null,
    };
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when category_id missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/category_id required/);
  });

  it('returns 404 when category does not belong to user', async () => {
    mockCategory = null;
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 (cannot_share_recording_category) — API guard', async () => {
    mockRecordingCount = 1;
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('cannot_share_recording_category');
  });

  it('returns 400 when DB trigger fires (check_violation fail-safe)', async () => {
    mockShareInsertResult = { data: null, error: { code: 'check_violation', message: 'booking-recording' } };
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('cannot_share_recording_category');
  });

  it('returns 409 on duplicate recipient (DB 23505)', async () => {
    mockShareInsertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1', recipient_user_id: 'user-2' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/);
  });

  it('returns 201 on valid link-only share', async () => {
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.share.share_token).toBe('tok-abc');
    expect(json.share.recipient_user_id).toBeNull();
  });

  it('returns 201 on direct share with recipient + can_resave', async () => {
    mockShareInsertResult = {
      data: {
        id: 'share-2', share_token: 'tok-xyz', category_id: 'cat-1',
        recipient_user_id: 'user-2', can_resave: true, expires_at: null, created_at: '2026-01-01',
      },
      error: null,
    };
    const { POST } = await import('../route');
    const res = await POST(makePost({ category_id: 'cat-1', recipient_user_id: 'user-2', can_resave: true }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.share.recipient_user_id).toBe('user-2');
    expect(json.share.can_resave).toBe(true);
  });
});

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/fragments/shares', () => {
  beforeEach(() => {
    mockUser       = { id: 'user-1', email: 'user@example.com' };
    mockSharesList = [];
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { GET } = await import('../route');
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no shares', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect((await res.json()).shares).toEqual([]);
  });

  it('returns list of active shares for owner', async () => {
    mockSharesList = [{
      id: 'share-1', share_token: 'tok-1', category_id: 'cat-1',
      recipient_user_id: null, can_resave: false, expires_at: null,
      revoked_at: null, created_at: '2026-01-01',
      user_categories: { name: 'Test', color: null },
    }];
    const { GET } = await import('../route');
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shares).toHaveLength(1);
    expect(json.shares[0].id).toBe('share-1');
  });
});
