/**
 * Tests for GET and POST /api/admin/fragments/sessions/[sessionId]
 *
 * Covers:
 * - Non-admin → 403
 * GET:
 * - Returns sorted fragments for sessionId
 * POST:
 * - Empty fragments array → clears all existing fragments (returns empty list)
 * - Valid upsert with new fragment (no id) → server-assigned id in response
 * - Overlap → 422 from DB check_violation
 * - Fragment id stability: sending existing fragment id → same id preserved in response
 * - Missing title → 400 validation error
 * - end_sec <= start_sec → 400 validation error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockIsAdmin = true;

// Sequence of results returned by session_fragments selects (in call order)
// GET does 1 select; POST does: (1) current-ids select, (2) final-state select
let mockFragmentsCallQueue: Array<Array<Record<string, unknown>>> = [];

// What the session_templates single() returns
let mockSessionRow: { id: string } | null = { id: 'sess-1' };

// Insert error (simulate constraint violation)
let mockInsertError: { code: string; message: string } | null = null;

// Update error
let mockUpdateError: { code: string; message: string } | null = null;

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: async () => {
    if (!mockIsAdmin) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { admin: true, user: { id: 'admin-user-1' } };
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => makeDb(),
}));

// ─── DB mock factory ─────────────────────────────────────────────────────────

function makeDb() {
  return {
    from: (table: string) => makeTableChain(table),
  };
}

function makeTableChain(table: string) {
  // Each call to from('session_fragments') gets the next item from the queue
  if (table === 'session_fragments') {
    const queuedResult = mockFragmentsCallQueue.shift() ?? [];
    return makeFragmentsChain(queuedResult);
  }
  if (table === 'session_templates') {
    return makeSessionTemplatesChain();
  }
  // Fallback passthrough for other tables (active_streams etc.)
  return makeNoopChain();
}

function makeFragmentsChain(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const self = () => chain;

  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.order = self;
  chain.not = self;
  chain.limit = self;

  // Make the chain itself awaitable (for: await db.from(...).select().eq().order())
  (chain as any).then = (
    resolve: (v: { data: Array<Record<string, unknown>>; error: null }) => void,
  ) => resolve({ data: rows, error: null });

  // single() for GET (not used in admin route but keep for safety)
  chain.single = async () => ({ data: rows[0] ?? null, error: null });

  // delete()
  chain.delete = () => {
    const dc: Record<string, (...args: unknown[]) => unknown> = {};
    const dcSelf = () => dc;
    dc.in = dcSelf;
    dc.eq = dcSelf;
    (dc as any).then = (resolve: (v: { data: null; error: null }) => void) =>
      resolve({ data: null, error: null });
    return dc;
  };

  // insert()
  chain.insert = (_rows: unknown) => {
    const ic: Record<string, (...args: unknown[]) => unknown> = {};
    (ic as any).then = (
      resolve: (v: { data: null; error: typeof mockInsertError }) => void,
    ) => resolve({ data: null, error: mockInsertError });
    return ic;
  };

  // update()
  chain.update = (_data: unknown) => {
    const uc: Record<string, (...args: unknown[]) => unknown> = {};
    const ucSelf = () => uc;
    uc.eq = ucSelf;
    (uc as any).then = (
      resolve: (v: { data: null; error: typeof mockUpdateError }) => void,
    ) => resolve({ data: null, error: mockUpdateError });
    return uc;
  };

  return chain;
}

function makeSessionTemplatesChain() {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.order = self;
  chain.single = async () => ({ data: mockSessionRow, error: null });
  (chain as any).then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data: mockSessionRow, error: null });
  return chain;
}

function makeNoopChain() {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.order = self;
  chain.single = async () => ({ data: null, error: null });
  chain.upsert = async () => ({ data: null, error: null });
  (chain as any).then = (resolve: (v: { data: null; error: null }) => void) =>
    resolve({ data: null, error: null });
  return chain;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(sessionId: string): [NextRequest, { params: Promise<{ sessionId: string }> }] {
  const req = new NextRequest(`http://localhost/api/admin/fragments/sessions/${sessionId}`);
  return [req, { params: Promise.resolve({ sessionId }) }];
}

function makePostRequest(
  sessionId: string,
  body: unknown,
): [NextRequest, { params: Promise<{ sessionId: string }> }] {
  const req = new NextRequest(`http://localhost/api/admin/fragments/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ sessionId }) }];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/fragments/sessions/[sessionId]', () => {
  beforeEach(() => {
    mockIsAdmin = true;
    mockFragmentsCallQueue = [];
    mockSessionRow = { id: 'sess-1' };
    mockInsertError = null;
    mockUpdateError = null;
  });

  it('returns 403 for non-admin', async () => {
    mockIsAdmin = false;
    const { GET } = await import('../route');
    const [req, ctx] = makeGetRequest('sess-1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it('returns sorted fragments for sessionId', async () => {
    // GET does one select on session_fragments
    mockFragmentsCallQueue = [
      [
        { id: 'frag-a', ordinal: 1, start_sec: 0, end_sec: 30, title: 'Intro' },
        { id: 'frag-b', ordinal: 2, start_sec: 30, end_sec: 60, title: 'Middle' },
      ],
    ];
    const { GET } = await import('../route');
    const [req, ctx] = makeGetRequest('sess-1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fragments).toHaveLength(2);
    expect(json.fragments[0].id).toBe('frag-a');
    expect(json.fragments[1].id).toBe('frag-b');
  });
});

describe('POST /api/admin/fragments/sessions/[sessionId]', () => {
  beforeEach(() => {
    mockIsAdmin = true;
    mockFragmentsCallQueue = [];
    mockSessionRow = { id: 'sess-1' };
    mockInsertError = null;
    mockUpdateError = null;
  });

  it('returns 403 for non-admin', async () => {
    mockIsAdmin = false;
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', { fragments: [] });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 400 when fragments array is missing', async () => {
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', { not_fragments: [] });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/fragments array/);
  });

  it('returns 400 when fragment is missing title', async () => {
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', {
      fragments: [{ ordinal: 1, start_sec: 0, end_sec: 60 }],
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/title/);
  });

  it('returns 400 when end_sec <= start_sec', async () => {
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', {
      fragments: [{ ordinal: 1, start_sec: 60, end_sec: 60, title: 'Bad range' }],
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/start_sec < end_sec/);
  });

  it('empty fragments array → clears all existing fragments, returns empty list', async () => {
    // POST does: (1) session_templates single, (2) current-ids select, (3) final-state select
    // current-ids: two existing fragments; final-state: empty (after delete)
    mockFragmentsCallQueue = [
      [{ id: 'old-frag-1' }, { id: 'old-frag-2' }], // current-ids select
      [], // final-state select after delete
    ];
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', { fragments: [] });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fragments).toEqual([]);
  });

  it('valid new fragment (no id) → server-assigns an id in response', async () => {
    // POST from('session_fragments') calls in order:
    // 1. current-ids select (thenable)
    // 2. insert() (thenable — returns insert error or null)
    // 3. final-state select (thenable)
    mockFragmentsCallQueue = [
      [], // (1) current-ids select (no existing fragments)
      [], // (2) insert — chain is thenable, returns [] (insert result ignored)
      [{ id: 'server-gen-id', ordinal: 1, start_sec: 0, end_sec: 30, title: 'New Fragment' }], // (3) final-state
    ];
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', {
      fragments: [{ ordinal: 1, start_sec: 0, end_sec: 30, title: 'New Fragment' }],
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fragments).toHaveLength(1);
    expect(json.fragments[0].id).toBe('server-gen-id');
    expect(json.fragments[0].title).toBe('New Fragment');
  });

  it('overlap → 422 from DB constraint violation on insert', async () => {
    mockInsertError = { code: '23514', message: 'violates check constraint "no_overlap"' };
    mockFragmentsCallQueue = [
      [], // current-ids select (no existing fragments, so all go to insert)
      // No final-state call expected — route returns early on insert error
    ];
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', {
      fragments: [{ ordinal: 1, start_sec: 0, end_sec: 60, title: 'Overlapping' }],
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/no_overlap/);
  });

  it('fragment id stability: existing id in payload → same id preserved in response', async () => {
    // POST from('session_fragments') calls in order:
    // 1. current-ids select
    // 2. update() (thenable)
    // 3. final-state select
    mockFragmentsCallQueue = [
      [{ id: 'stable-frag-id' }], // (1) current-ids select
      [], // (2) update — chain is thenable, returns []
      [{ id: 'stable-frag-id', ordinal: 1, start_sec: 0, end_sec: 45, title: 'Updated Title' }], // (3) final-state
    ];
    const { POST } = await import('../route');
    const [req, ctx] = makePostRequest('sess-1', {
      fragments: [
        { id: 'stable-frag-id', ordinal: 1, start_sec: 0, end_sec: 45, title: 'Updated Title' },
      ],
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fragments).toHaveLength(1);
    expect(json.fragments[0].id).toBe('stable-frag-id');
    expect(json.fragments[0].title).toBe('Updated Title');
  });
});
