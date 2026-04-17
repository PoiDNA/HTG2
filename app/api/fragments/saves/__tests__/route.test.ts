/**
 * Tests for POST /api/fragments/saves
 *
 * Covers:
 * - 401 when not authenticated
 * - 403 when no fragment_access entitlement (non-admin)
 * - Source XOR validation (no source / both sources / predefined + recording)
 * - fragment_type validation
 * - Custom range: end > start enforcement
 * - Predefined: fallback timestamps required
 * - 409 on duplicate save (DB code 23505)
 * - 422 on check constraint violation (DB code 23514)
 * - 201 on valid custom VOD save
 * - Admin bypass: skips fragment-access gate
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string; email: string } | null = { id: 'user-1', email: 'user@example.com' };
let mockFragmentAccess = true;
let mockSessionData: { id: string; is_published: boolean } | null = { id: 'sess-1', is_published: true };
let mockRecordingAccess: { id: string } | null = null;
let mockCategoryData: { id: string; user_id: string } | null = null;
let mockFragmentData: { id: string; session_template_id: string; start_sec: number; end_sec: number } | null = null;
let mockInsertResult: { data: unknown; error: unknown } = {
  data: { id: 'save-1', fragment_type: 'custom', session_template_id: 'sess-1', is_favorite: false, created_at: '2026-01-01' },
  error: null,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    from: (table: string) => makeServerChain(table),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => ({
    from: (table: string) => makeServiceChain(table),
  }),
}));

vi.mock('@/lib/roles', () => ({
  isAdminEmail: (email: string) => email === 'admin@htg.com',
}));

vi.mock('@/lib/access/fragment-access', () => ({
  userHasFragmentAccess: async () => mockFragmentAccess,
}));

// ─── Chain helpers ────────────────────────────────────────────────────────────

function makeServiceChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain.select   = self;
  chain.eq       = self;
  chain.in       = self;
  chain.not      = self;
  chain.is       = self;
  chain.gt       = self;
  chain.limit    = self;
  chain.order    = self;
  chain.insert   = () => insertChain();
  chain.update   = self;

  chain.single = async () => {
    if (table === 'session_templates')   return { data: mockSessionData, error: null };
    if (table === 'booking_recording_access') return { data: null, error: null }; // not used via single
    if (table === 'user_categories')     return { data: mockCategoryData, error: null };
    if (table === 'session_fragments')   return { data: mockFragmentData, error: null };
    return { data: null, error: null };
  };
  chain.maybeSingle = async () => {
    if (table === 'booking_recording_access') return { data: mockRecordingAccess, error: null };
    return { data: null, error: null };
  };

  return chain;
}

function makeServerChain(_table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select   = self;
  chain.eq       = self;
  chain.order    = self;
  chain.range    = async () => ({ data: [], error: null });
  return chain;
}

function insertChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.single = async () => mockInsertResult;
  return chain;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fragments/saves', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/fragments/saves', () => {
  beforeEach(() => {
    mockUser            = { id: 'user-1', email: 'user@example.com' };
    mockFragmentAccess  = true;
    mockSessionData     = { id: 'sess-1', is_published: true };
    mockRecordingAccess = null;
    mockCategoryData    = null;
    mockFragmentData    = null;
    mockInsertResult    = {
      data: { id: 'save-1', fragment_type: 'custom', session_template_id: 'sess-1', is_favorite: false, created_at: '2026-01-01' },
      error: null,
    };
  });

  // ── Auth ──

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fragment_type: 'custom', session_template_id: 'sess-1', custom_start_sec: 10, custom_end_sec: 20 }));
    expect(res.status).toBe(401);
  });

  // ── Fragment feature gate ──

  it('returns 403 when user has no fragment_access entitlement', async () => {
    mockFragmentAccess = false;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fragment_type: 'custom', session_template_id: 'sess-1', custom_start_sec: 10, custom_end_sec: 20 }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('fragment_access_required');
  });

  it('admin bypasses fragment-access gate (isAdmin=true)', async () => {
    mockUser = { id: 'admin-1', email: 'admin@htg.com' };
    mockFragmentAccess = false; // would block a normal user
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fragment_type: 'custom', session_template_id: 'sess-1', custom_start_sec: 10, custom_end_sec: 20 }));
    expect(res.status).toBe(201);
  });

  // ── Source XOR validation ──

  it('returns 400 when no source provided', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fragment_type: 'custom', custom_start_sec: 10, custom_end_sec: 20 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/session_template_id or booking_recording_id/);
  });

  it('returns 400 when both sources provided', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      booking_recording_id: 'rec-1',
      custom_start_sec: 10,
      custom_end_sec: 20,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Only one of/);
  });

  // ── fragment_type validation ──

  it('returns 400 for invalid fragment_type', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fragment_type: 'INVALID', session_template_id: 'sess-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/fragment_type must be predefined or custom/);
  });

  it('returns 400 for predefined + booking_recording_id', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'predefined',
      booking_recording_id: 'rec-1',
      fallback_start_sec: 10,
      fallback_end_sec: 20,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Predefined fragments are only available for VOD/);
  });

  // ── Custom range validation ──

  it('returns 400 when custom_end_sec <= custom_start_sec', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      custom_start_sec: 60,
      custom_end_sec: 60,        // equal, not greater
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/custom_end_sec must be greater/);
  });

  it('returns 400 when custom timestamps missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      // missing custom_start_sec / custom_end_sec
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/custom_start_sec and custom_end_sec required/);
  });

  // ── Predefined validation ──

  it('returns 400 when predefined save missing fallback timestamps', async () => {
    mockFragmentData = { id: 'frag-1', session_template_id: 'sess-1', start_sec: 10, end_sec: 40 };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'predefined',
      session_template_id: 'sess-1',
      session_fragment_id: 'frag-1',
      // missing fallback_start_sec / fallback_end_sec
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/fallback_start_sec and fallback_end_sec required/);
  });

  // ── DB constraint errors ──

  it('returns 409 on duplicate save (DB code 23505)', async () => {
    mockInsertResult = { data: null, error: { code: '23505', message: 'duplicate' } };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      custom_start_sec: 10,
      custom_end_sec: 40,
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already saved/);
  });

  it('returns 422 on check constraint violation (DB code 23514)', async () => {
    mockInsertResult = { data: null, error: { code: '23514', message: 'violates check constraint' } };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      custom_start_sec: 10,
      custom_end_sec: 40,
    }));
    expect(res.status).toBe(422);
  });

  // ── Happy path ──

  it('returns 201 on valid custom VOD save', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'custom',
      session_template_id: 'sess-1',
      custom_start_sec: 30,
      custom_end_sec: 120,
      custom_title: 'Intro moment',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.save).toBeDefined();
    expect(json.save.id).toBe('save-1');
  });

  it('returns 201 on valid predefined save with fallback timestamps', async () => {
    mockFragmentData = { id: 'frag-1', session_template_id: 'sess-1', start_sec: 10, end_sec: 40 };
    mockInsertResult = {
      data: { id: 'save-2', fragment_type: 'predefined', session_template_id: 'sess-1', session_fragment_id: 'frag-1', is_favorite: false, created_at: '2026-01-01' },
      error: null,
    };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({
      fragment_type: 'predefined',
      session_template_id: 'sess-1',
      session_fragment_id: 'frag-1',
      fallback_start_sec: 10,
      fallback_end_sec: 40,
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.save.fragment_type).toBe('predefined');
  });
});
