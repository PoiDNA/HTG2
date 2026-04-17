/**
 * Tests for GET /api/fragments/shares/by-token/[token]
 *
 * Covers:
 * - 401 when not authenticated
 * - 429 when rate limited (anti-enumeration)
 * - 404 when share not found (invalid token / revoked)
 * - 404 when share is expired (expires_at in the past)
 * - 404 when direct share's recipient_user_id doesn't match caller
 * - 200 with field allowlist — no owner PII (owner_user_id, owner email absent)
 * - 200 allows access for matching direct-share recipient
 * - saves transform: custom_title used when present, fallback title generated from timestamps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string; email: string } | null = { id: 'user-1', email: 'u@x.com' };
let mockRateLimited = false;
let mockShare: Record<string, unknown> | null = {
  id: 'share-1',
  category_id: 'cat-1',
  owner_user_id: 'owner-99',
  recipient_user_id: null,
  can_resave: false,
  expires_at: null,
  revoked_at: null,
};
let mockCategory: { id: string; name: string; color: string | null } | null = {
  id: 'cat-1',
  name: 'Medytacje',
  color: '#4f46e5',
};
let mockSaves: unknown[] = [];

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => ({ from: (t: string) => makeServiceChain(t) }),
}));

vi.mock('@/lib/rate-limit/check', () => ({
  checkRateLimit: async () => mockRateLimited,
  logRateLimitAction: async () => undefined,
}));

// ─── Chain factory ────────────────────────────────────────────────────────────

function makeServiceChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq     = self;
  chain.is     = self;
  chain.not    = self;
  chain.order  = self;
  chain.limit  = self;

  chain.single = async () => {
    if (table === 'category_shares')  return { data: mockShare,    error: null };
    if (table === 'user_categories')  return { data: mockCategory, error: null };
    return { data: null, error: null };
  };

  // user_fragment_saves list query (thenable)
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    if (table === 'user_fragment_saves') {
      return Promise.resolve({ data: mockSaves, error: null }).then(resolve, reject);
    }
    return Promise.resolve({ data: null, error: null }).then(resolve, reject);
  };

  return chain;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/fragments/shares/by-token/${token}`);
}

const PARAMS = (token: string) => ({ params: Promise.resolve({ token }) });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/fragments/shares/by-token/[token]', () => {
  beforeEach(() => {
    mockUser        = { id: 'user-1', email: 'u@x.com' };
    mockRateLimited = false;
    mockShare       = {
      id: 'share-1', category_id: 'cat-1', owner_user_id: 'owner-99',
      recipient_user_id: null, can_resave: false, expires_at: null, revoked_at: null,
    };
    mockCategory = { id: 'cat-1', name: 'Medytacje', color: '#4f46e5' };
    mockSaves    = [];
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok'), PARAMS('tok'));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimited = true;
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok'), PARAMS('tok'));
    expect(res.status).toBe(429);
  });

  it('returns 404 when share not found (invalid token)', async () => {
    mockShare = null;
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-bad'), PARAMS('tok-bad'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/);
  });

  it('returns 404 when share is expired', async () => {
    mockShare = { ...mockShare, expires_at: '2020-01-01T00:00:00Z' };
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-exp'), PARAMS('tok-exp'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/expired/);
  });

  it('returns 404 when direct share recipient does not match caller', async () => {
    mockShare = { ...mockShare, recipient_user_id: 'user-other' };
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-direct'), PARAMS('tok-direct'));
    expect(res.status).toBe(404);
  });

  it('allows access for matching direct-share recipient', async () => {
    mockShare = { ...mockShare, recipient_user_id: 'user-1' }; // matches mockUser.id
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-mine'), PARAMS('tok-mine'));
    expect(res.status).toBe(200);
  });

  it('returns 200 with field allowlist — no owner PII exposed', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-pub'), PARAMS('tok-pub'));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Required fields present
    expect(json.share.id).toBe('share-1');
    expect(json.share.category_name).toBe('Medytacje');
    expect(json.share.category_color).toBe('#4f46e5');
    expect(json.share.can_resave).toBe(false);

    // PII absent
    expect(json.share).not.toHaveProperty('owner_user_id');
    expect(json.share).not.toHaveProperty('owner_email');
    expect(json.share).not.toHaveProperty('recipient_user_id');

    expect(Array.isArray(json.saves)).toBe(true);
  });

  it('falls back to "Fragmenty" when category is missing', async () => {
    mockCategory = null;
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-nocat'), PARAMS('tok-nocat'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share.category_name).toBe('Fragmenty');
    expect(json.share.category_color).toBeNull();
  });

  it('transforms saves with custom_title when present', async () => {
    mockSaves = [{
      id: 'save-1',
      fragment_type: 'custom',
      custom_start_sec: 30,
      custom_end_sec: 90,
      custom_title: 'Moment ciszy',
      fallback_start_sec: null,
      fallback_end_sec: null,
      session_fragments: null,
      session_templates: { id: 'sess-1', title: 'Spokój', slug: 'spokoj' },
    }];
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-saves'), PARAMS('tok-saves'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saves).toHaveLength(1);
    expect(json.saves[0].title).toBe('Moment ciszy');
    expect(json.saves[0].start_sec).toBe(30);
    expect(json.saves[0].end_sec).toBe(90);
    expect(json.saves[0].session_title).toBe('Spokój');
    expect(json.saves[0].session_slug).toBe('spokoj');
  });

  it('generates timestamp title when custom_title absent', async () => {
    mockSaves = [{
      id: 'save-2',
      fragment_type: 'custom',
      custom_start_sec: 65,   // 1:05
      custom_end_sec: 125,    // 2:05
      custom_title: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      session_fragments: null,
      session_templates: { id: 'sess-1', title: 'Spokój', slug: 'spokoj' },
    }];
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-ts'), PARAMS('tok-ts'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saves[0].title).toBe('1:05 – 2:05');
  });

  it('uses fallback_start/end for predefined fragments', async () => {
    mockSaves = [{
      id: 'save-3',
      fragment_type: 'predefined',
      custom_start_sec: null,
      custom_end_sec: null,
      custom_title: null,
      fallback_start_sec: 10,
      fallback_end_sec: 40,
      session_fragments: { title: 'Oddech', title_i18n: {} },
      session_templates: { id: 'sess-1', title: 'Spokój', slug: 'spokoj' },
    }];
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-pred'), PARAMS('tok-pred'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.saves[0].title).toBe('Oddech');  // from session_fragments.title
    expect(json.saves[0].start_sec).toBe(10);
    expect(json.saves[0].end_sec).toBe(40);
  });

  it('future expires_at is treated as still-valid share', async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    mockShare = { ...mockShare, expires_at: future };
    const { GET } = await import('../route');
    const res = await GET(makeRequest('tok-future'), PARAMS('tok-future'));
    expect(res.status).toBe(200);
  });
});
