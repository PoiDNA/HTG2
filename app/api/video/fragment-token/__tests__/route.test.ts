/**
 * Tests for POST /api/video/fragment-token
 *
 * Covers:
 * - 401 when not authenticated
 * - 429 when rate-limited
 * - 403 (blocked user) — profile.is_blocked = true
 * - 400 when missing deviceId
 * - 400 when neither saveId nor sessionFragmentId provided
 * - 400 when both provided
 * PATH B (impulse):
 * - fragment not found / is_impulse=false → 200 allowed:false
 * - fragment is_impulse=true, user has session access → 200 allowed:true with startSec/endSec
 * - admin bypass: admin without session access → 200 allowed:true
 * PATH A (save-based, VOD):
 * - save not found → allowed:false
 * - no session access → allowed:false, title: 'Brak dostępu do sesji'
 * - valid predefined save → allowed:true, startSec from fallback_start_sec
 * - valid custom save → allowed:true, startSec from custom_start_sec
 * - radio flag → sessionType: 'fragment_radio'
 * - no radio flag → sessionType: 'fragment_review'
 * PATH A (save-based, booking_recording):
 * - valid recording save with access → allowed:true, sessionType: 'fragment_recording_review'
 * - recording access denied → error response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mutable mock state ───────────────────────────────────────────────────────

let mockUser: { id: string; email: string } | null = { id: 'user-1', email: 'user@example.com' };
let mockRateLimited = false;
let mockFragmentAccess = true;
let mockSessionAccess = true;
let mockRecordingAccessResult: {
  ok: boolean;
  status?: number;
  body?: unknown;
  recording?: {
    bunny_video_id: string;
    bunny_library_id: string;
    backup_storage_path: string | null;
    duration_seconds: number;
  };
} = {
  ok: true,
  recording: {
    bunny_video_id: 'vid-rec-1',
    bunny_library_id: 'lib-1',
    backup_storage_path: null,
    duration_seconds: 3600,
  },
};

const mockSignedMedia = {
  url: 'https://cdn.example.com/file.m4a',
  deliveryType: 'direct',
  mimeType: 'audio/mp4',
};

// profile returned by db.from('profiles').select(...).eq(...).single()
let mockProfile: { is_blocked: boolean; blocked_reason?: string } | null = { is_blocked: false };

// save returned by db.from('user_fragment_saves')...
let mockSave: Record<string, unknown> | null = null;

// session returned by db.from('session_templates')...
let mockSession: { bunny_video_id: string; bunny_library_id: string } | null = {
  bunny_video_id: 'vid-1',
  bunny_library_id: 'lib-1',
};

// impulse fragment returned by db.from('session_fragments')...single()
let mockImpulseFragment: Record<string, unknown> | null = {
  id: 'frag-1',
  start_sec: 30,
  end_sec: 90,
  session_template_id: 'sess-1',
  is_impulse: true,
  session_templates: {
    id: 'sess-1',
    is_published: true,
    bunny_video_id: 'vid-1',
    bunny_library_id: 'lib-1',
    title: 'Test Session',
  },
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
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

vi.mock('@/lib/admin/impersonate-const', () => ({
  IMPERSONATE_USER_COOKIE: 'impersonate',
}));

vi.mock('@/lib/rate-limit/check', () => ({
  checkRateLimit: async () => mockRateLimited,
  logRateLimitAction: async () => {},
}));

vi.mock('@/lib/access/fragment-access', () => ({
  userHasFragmentAccess: async () => mockFragmentAccess,
}));

vi.mock('@/lib/access/session-access', () => ({
  userHasSessionAccess: async () => mockSessionAccess,
}));

vi.mock('@/lib/access/recording-access', () => ({
  checkRecordingAccess: async () => mockRecordingAccessResult,
}));

vi.mock('@/lib/media-signing', () => ({
  signMedia: () => mockSignedMedia,
  computeTokenTtl: () => 3600,
}));

// ─── Chain helpers ────────────────────────────────────────────────────────────

function makeServiceChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain.select = self;
  chain.eq = self;
  chain.not = self;
  chain.in = self;
  chain.order = self;
  chain.limit = self;
  chain.upsert = async () => ({ data: null, error: null });
  chain.delete = self;
  chain.insert = self;
  chain.update = self;

  chain.single = async () => {
    if (table === 'profiles') return { data: mockProfile, error: null };
    if (table === 'user_fragment_saves') return { data: mockSave, error: null };
    if (table === 'session_templates') return { data: mockSession, error: null };
    if (table === 'session_fragments') return { data: mockImpulseFragment, error: null };
    return { data: null, error: null };
  };

  chain.maybeSingle = async () => ({ data: null, error: null });

  return chain;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/video/fragment-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Patch cookies if needed
  if (Object.keys(cookies).length > 0) {
    Object.defineProperty(req, 'cookies', {
      value: {
        get: (name: string) => cookies[name] ? { value: cookies[name] } : undefined,
      },
    });
  }
  return req;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/video/fragment-token', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1', email: 'user@example.com' };
    mockRateLimited = false;
    mockFragmentAccess = true;
    mockSessionAccess = true;
    mockProfile = { is_blocked: false };
    mockSave = null;
    mockSession = { bunny_video_id: 'vid-1', bunny_library_id: 'lib-1' };
    mockImpulseFragment = {
      id: 'frag-1',
      start_sec: 30,
      end_sec: 90,
      session_template_id: 'sess-1',
      is_impulse: true,
      session_templates: {
        id: 'sess-1',
        is_published: true,
        bunny_video_id: 'vid-1',
        bunny_library_id: 'lib-1',
        title: 'Test Session',
      },
    };
    mockRecordingAccessResult = {
      ok: true,
      recording: {
        bunny_video_id: 'vid-rec-1',
        bunny_library_id: 'lib-1',
        backup_storage_path: null,
        duration_seconds: 3600,
      },
    };
  });

  // ── Auth ──

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 's-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(401);
  });

  // ── Rate limit ──

  it('returns 429 when rate-limited', async () => {
    mockRateLimited = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 's-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(429);
  });

  // ── Blocked user ──

  it('returns allowed:false with title Konto zablokowane for blocked user', async () => {
    mockProfile = { is_blocked: true, blocked_reason: 'tos_violation' };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 's-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(false);
    expect(json.title).toBe('Konto zablokowane');
  });

  // ── Input validation ──

  it('returns 400 when deviceId is missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 's-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/deviceId/);
  });

  it('returns 400 when neither saveId nor sessionFragmentId provided', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ deviceId: 'dev-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/saveId or sessionFragmentId/);
  });

  it('returns 400 when both saveId and sessionFragmentId provided', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 's-1', sessionFragmentId: 'frag-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/OR/);
  });

  // ── PATH B: Impulse ──

  it('PATH B: returns allowed:false when impulse fragment not found', async () => {
    mockImpulseFragment = null;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ sessionFragmentId: 'frag-missing', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(false);
    expect(json.title).toBe('Fragment niedostępny');
  });

  it('PATH B: returns allowed:true with startSec/endSec when user has session access', async () => {
    mockSessionAccess = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ sessionFragmentId: 'frag-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(30);
    expect(json.endSec).toBe(90);
    expect(json.url).toBe('https://cdn.example.com/file.m4a');
    expect(json.sessionType).toBe('fragment_review');
  });

  it('PATH B: returns allowed:false when user lacks session access', async () => {
    mockSessionAccess = false;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ sessionFragmentId: 'frag-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(false);
    expect(json.title).toBe('Brak dostępu do sesji');
  });

  it('PATH B: admin bypass — returns allowed:true even without session access check', async () => {
    mockUser = { id: 'admin-1', email: 'admin@htg.com' };
    mockSessionAccess = false; // would block a normal user
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ sessionFragmentId: 'frag-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(30);
  });

  // ── PATH A: Save-based, VOD ──

  it('PATH A: returns allowed:false when save not found', async () => {
    mockSave = null;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-missing', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(false);
    expect(json.title).toBe('Fragment niedostępny');
  });

  it('PATH A VOD: returns allowed:false when user has no session access', async () => {
    mockSave = {
      id: 'save-1',
      user_id: 'user-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 10,
      custom_end_sec: 50,
    };
    mockSessionAccess = false;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(false);
    expect(json.title).toBe('Brak dostępu do sesji');
  });

  it('PATH A VOD predefined: returns allowed:true, startSec from fallback_start_sec', async () => {
    mockSave = {
      id: 'save-1',
      user_id: 'user-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'predefined',
      session_fragment_id: 'frag-1',
      fallback_start_sec: 15,
      fallback_end_sec: 75,
      custom_start_sec: null,
      custom_end_sec: null,
    };
    mockSessionAccess = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(15);
    expect(json.endSec).toBe(75);
  });

  it('PATH A VOD custom: returns allowed:true, startSec from custom_start_sec', async () => {
    mockSave = {
      id: 'save-2',
      user_id: 'user-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 120,
      custom_end_sec: 240,
    };
    mockSessionAccess = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-2', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(120);
    expect(json.endSec).toBe(240);
  });

  it('PATH A VOD: radio flag → sessionType fragment_radio', async () => {
    mockSave = {
      id: 'save-3',
      user_id: 'user-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 0,
      custom_end_sec: 60,
    };
    mockSessionAccess = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-3', deviceId: 'dev-1', radio: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.sessionType).toBe('fragment_radio');
  });

  it('PATH A VOD: no radio flag → sessionType fragment_review', async () => {
    mockSave = {
      id: 'save-4',
      user_id: 'user-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 0,
      custom_end_sec: 60,
    };
    mockSessionAccess = true;
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-4', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.sessionType).toBe('fragment_review');
  });

  it('PATH A VOD: admin bypass — returns allowed:true without session access check', async () => {
    mockUser = { id: 'admin-1', email: 'admin@htg.com' };
    mockSave = {
      id: 'save-5',
      user_id: 'admin-1',
      session_template_id: 'sess-1',
      booking_recording_id: null,
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 5,
      custom_end_sec: 55,
    };
    mockSessionAccess = false; // would block non-admin
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-5', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(5);
  });

  // ── PATH A: Save-based, booking_recording ──

  it('PATH A recording: returns allowed:true, sessionType fragment_recording_review', async () => {
    mockSave = {
      id: 'save-rec-1',
      user_id: 'user-1',
      session_template_id: null,
      booking_recording_id: 'rec-1',
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 60,
      custom_end_sec: 180,
    };
    mockRecordingAccessResult = {
      ok: true,
      recording: {
        bunny_video_id: 'vid-rec-1',
        bunny_library_id: 'lib-1',
        backup_storage_path: null,
        duration_seconds: 3600,
      },
    };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-rec-1', deviceId: 'dev-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(json.startSec).toBe(60);
    expect(json.endSec).toBe(180);
    expect(json.sessionType).toBe('fragment_recording_review');
  });

  it('PATH A recording: recording access denied → error response', async () => {
    mockSave = {
      id: 'save-rec-2',
      user_id: 'user-1',
      session_template_id: null,
      booking_recording_id: 'rec-2',
      fragment_type: 'custom',
      session_fragment_id: null,
      fallback_start_sec: null,
      fallback_end_sec: null,
      custom_start_sec: 0,
      custom_end_sec: 60,
    };
    mockRecordingAccessResult = {
      ok: false,
      status: 403,
      body: { allowed: false, title: 'Brak dostępu', message: 'Nagranie prywatne.' },
    };
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ saveId: 'save-rec-2', deviceId: 'dev-1' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.allowed).toBe(false);
  });
});
