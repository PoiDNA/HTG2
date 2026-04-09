// Tests for insights-audit helper.
//
// We mock @/lib/supabase/service so the test does not need a real database.
// The mock captures whatever is passed to .insert() so we can assert the
// payload shape. Two scenarios are covered:
//   - happy path: Supabase returns no error → helper returns true
//   - error path: Supabase returns an error → helper returns false (best-effort)
//   - throw path: createSupabaseServiceRole throws → helper returns false
//
// The auditInsightsAccessFromRequest convenience wrapper is also tested for
// header extraction (x-forwarded-for, x-real-ip, user-agent) and for nullable
// header handling.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Module-level mutable state used by the mock to simulate different outcomes.
// We re-assign these in beforeEach for isolation.
let mockInsertResult: { error: { message: string } | null } = { error: null };
let mockShouldThrow = false;
const insertCalls: Array<{ table: string; payload: unknown }> = [];

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceRole: () => {
    if (mockShouldThrow) {
      throw new Error('mock service-role failure');
    }
    return {
      from(table: string) {
        return {
          insert: async (payload: unknown) => {
            insertCalls.push({ table, payload });
            return mockInsertResult;
          },
        };
      },
    };
  },
}));

import {
  auditInsightsAccess,
  auditInsightsAccessFromRequest,
  NIL_BOOKING_ID,
} from '../insights-audit';

beforeEach(() => {
  mockInsertResult = { error: null };
  mockShouldThrow = false;
  insertCalls.length = 0;
});

describe('auditInsightsAccess', () => {
  it('inserts a row with all fields populated and returns true', async () => {
    const ok = await auditInsightsAccess({
      bookingId: 'booking-123',
      actorId: 'admin-456',
      actorEmail: 'admin@example.com',
      action: 'viewed_transcript',
      details: { recording_id: 'rec-789' },
      ipAddress: '192.0.2.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('session_client_insights_audit');
    expect(insertCalls[0].payload).toEqual({
      booking_id: 'booking-123',
      actor_id: 'admin-456',
      actor_email: 'admin@example.com',
      action: 'viewed_transcript',
      details: { recording_id: 'rec-789' },
      ip_address: '192.0.2.1',
      user_agent: 'Mozilla/5.0',
    });
  });

  it('defaults details to {} when not provided', async () => {
    await auditInsightsAccess({
      bookingId: 'b1',
      actorId: 'a1',
      actorEmail: 'a@x.com',
      action: 'viewed_list',
    });

    expect(insertCalls[0].payload).toMatchObject({ details: {} });
  });

  it('passes null for missing IP and user agent', async () => {
    await auditInsightsAccess({
      bookingId: 'b1',
      actorId: 'a1',
      actorEmail: null,
      action: 'viewed_list',
    });

    expect(insertCalls[0].payload).toMatchObject({
      ip_address: null,
      user_agent: null,
      actor_email: null,
    });
  });

  it('returns false (does not throw) when Supabase returns an error', async () => {
    mockInsertResult = { error: { message: 'permission denied' } };

    const ok = await auditInsightsAccess({
      bookingId: 'b1',
      actorId: 'a1',
      actorEmail: 'a@x.com',
      action: 'viewed_list',
    });

    expect(ok).toBe(false);
  });

  it('returns false (does not throw) when createSupabaseServiceRole throws', async () => {
    mockShouldThrow = true;

    const ok = await auditInsightsAccess({
      bookingId: 'b1',
      actorId: 'a1',
      actorEmail: 'a@x.com',
      action: 'viewed_list',
    });

    expect(ok).toBe(false);
    expect(insertCalls).toHaveLength(0); // never reached the insert
  });

  it('accepts all four allowed action codes', async () => {
    const actions = ['viewed_list', 'viewed_transcript', 'viewed_insights', 'downloaded_pdf'] as const;

    for (const action of actions) {
      await auditInsightsAccess({
        bookingId: 'b1',
        actorId: 'a1',
        actorEmail: 'a@x.com',
        action,
      });
    }

    expect(insertCalls).toHaveLength(4);
    expect(insertCalls.map((c) => (c.payload as { action: string }).action)).toEqual([
      'viewed_list',
      'viewed_transcript',
      'viewed_insights',
      'downloaded_pdf',
    ]);
  });
});

describe('auditInsightsAccessFromRequest', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('http://example.com/api/admin/insights/b1', { headers });
  }

  it('extracts ip from x-forwarded-for and user-agent', async () => {
    const req = makeRequest({
      'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      'user-agent': 'Test/1.0',
    });

    await auditInsightsAccessFromRequest(
      req,
      { id: 'admin-1', email: 'admin@x.com' },
      'booking-1',
      'viewed_transcript',
      { recording_id: 'r1' },
    );

    expect(insertCalls[0].payload).toMatchObject({
      ip_address: '203.0.113.5, 10.0.0.1',
      user_agent: 'Test/1.0',
      actor_id: 'admin-1',
      actor_email: 'admin@x.com',
      booking_id: 'booking-1',
      action: 'viewed_transcript',
      details: { recording_id: 'r1' },
    });
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', async () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.7' });
    await auditInsightsAccessFromRequest(
      req,
      { id: 'a', email: 'a@x.com' },
      'b',
      'viewed_list',
    );

    expect(insertCalls[0].payload).toMatchObject({ ip_address: '198.51.100.7' });
  });

  it('passes null for ip when both headers are missing', async () => {
    const req = makeRequest({});
    await auditInsightsAccessFromRequest(
      req,
      { id: 'a', email: 'a@x.com' },
      'b',
      'viewed_list',
    );

    expect(insertCalls[0].payload).toMatchObject({
      ip_address: null,
      user_agent: null,
    });
  });

  it('handles null actor email', async () => {
    const req = makeRequest({});
    await auditInsightsAccessFromRequest(
      req,
      { id: 'a', email: null },
      'b',
      'viewed_list',
    );

    expect(insertCalls[0].payload).toMatchObject({ actor_email: null });
  });
});

describe('NIL_BOOKING_ID sentinel', () => {
  it('is the all-zero UUID', () => {
    expect(NIL_BOOKING_ID).toBe('00000000-0000-0000-0000-000000000000');
  });
});
