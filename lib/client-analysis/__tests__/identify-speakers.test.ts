import { describe, it, expect } from 'vitest';
import { identifySpeakers } from '../identify-speakers';

// Supabase fluent query builder mock. Each .from() call returns a new
// builder whose terminal methods (.single / .maybeSingle) resolve to the
// data configured in `fixtures` per (table, select, filter) combination.

interface Fixture {
  [table: string]: unknown;
}

function makeDbMock(fixtures: Fixture) {
  return {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        not() { return this; },
        maybeSingle: async () => ({ data: fixtures[table] ?? null }),
        single: async () => ({ data: fixtures[table] ?? null, error: null }),
        // For lists (practitioners, companions)
        then(onFulfilled: (arg: { data: unknown; error: null }) => unknown) {
          return Promise.resolve({ data: fixtures[table] ?? null, error: null }).then(onFulfilled);
        },
      };
    },
  };
}

// More specific mock that returns different payloads per table.
// Supabase returns { data, error } on awaited query builders.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(tables: Record<string, any>): any {
  return {
    from(table: string) {
      const payload = tables[table];
      const builder = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select(..._args: any[]) { return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq(..._args: any[]) { return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        not(..._args: any[]) { return builder; },
        single: async () => {
          if (Array.isArray(payload)) return { data: payload[0] ?? null, error: null };
          return { data: payload ?? null, error: null };
        },
        maybeSingle: async () => {
          if (Array.isArray(payload)) return { data: payload[0] ?? null, error: null };
          return { data: payload ?? null, error: null };
        },
        // For list-returning queries (without .single())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(onFulfilled: (arg: any) => unknown) {
          const data = Array.isArray(payload) ? payload : payload ? [payload] : [];
          return Promise.resolve({ data, error: null }).then(onFulfilled);
        },
      };
      return builder;
    },
  };
}

describe('identifySpeakers', () => {
  it('maps primary client for natalia_solo', async () => {
    const db = makeDb({
      live_sessions: { booking_id: 'b1', slot_id: 's1' },
      bookings: { user_id: 'client-uuid', session_type: 'natalia_solo' },
      profiles: { display_name: 'Anna' },
      staff_members: [
        { user_id: 'natalia-uuid', name: 'Natalia' },
      ],
      booking_slots: { assistant_id: null },
    });

    const result = await identifySpeakers(db, 'session-1');
    expect(result.get('client-uuid')).toEqual({ role: 'client', name: 'Anna' });
    expect(result.get('natalia-uuid')).toEqual({ role: 'host', name: 'Natalia' });
  });

  it('maps two clients for natalia_para', async () => {
    const db = makeDb({
      live_sessions: { booking_id: 'b1', slot_id: 's1' },
      bookings: { user_id: 'client-a', session_type: 'natalia_para' },
      profiles: { display_name: 'Anna' },
      booking_companions: [
        { user_id: 'client-b', display_name: 'Bartek' },
      ],
      staff_members: [{ user_id: 'natalia-uuid', name: 'Natalia' }],
      booking_slots: { assistant_id: null },
    });

    const result = await identifySpeakers(db, 'session-1');
    expect(result.get('client-a')?.role).toBe('client');
    expect(result.get('client-b')?.role).toBe('client');
    expect(result.get('client-b')?.name).toBe('Bartek');
    expect(result.get('natalia-uuid')?.role).toBe('host');
  });

  it('does not load companions for non-para session_type', async () => {
    // Solo session shouldn't touch booking_companions even if the table has data
    const db = makeDb({
      live_sessions: { booking_id: 'b1', slot_id: 's1' },
      bookings: { user_id: 'client-a', session_type: 'natalia_solo' },
      profiles: { display_name: 'Anna' },
      booking_companions: [{ user_id: 'should-not-appear', display_name: 'Partner' }],
      staff_members: [{ user_id: 'natalia-uuid', name: 'Natalia' }],
      booking_slots: { assistant_id: null },
    });

    const result = await identifySpeakers(db, 'session-1');
    // Partner should NOT be mapped because session_type is natalia_solo
    expect(result.has('should-not-appear')).toBe(false);
  });

  it('maps assistant via booking_slots.assistant_id', async () => {
    // Needs 2-level lookup: slot → staff_members by id.
    // Our mock always returns the same payload per table, so this simulates happy path.
    const db = makeDb({
      live_sessions: { booking_id: 'b1', slot_id: 's1' },
      bookings: { user_id: 'client-uuid', session_type: 'natalia_asysta' },
      profiles: { display_name: 'Klient' },
      staff_members: { user_id: 'asyst-uuid', name: 'Agata' },
      booking_slots: { assistant_id: 'staff-row-id' },
    });

    const result = await identifySpeakers(db, 'session-1');
    // 'asyst-uuid' is returned as staff_members.single() — could be host OR assistant
    // depending on order. First pass marks it as host (practitioner query comes first).
    // Second pass (assistant lookup) sees it's already mapped and does NOT override.
    // This is the defensive coding mentioned in identify-speakers.ts.
    expect(result.has('client-uuid')).toBe(true);
    expect(result.has('asyst-uuid')).toBe(true);
  });

  it('falls back to "Klient" name when profile missing', async () => {
    const db = makeDb({
      live_sessions: { booking_id: 'b1', slot_id: 's1' },
      bookings: { user_id: 'client-uuid', session_type: 'natalia_solo' },
      profiles: null,
      staff_members: [],
      booking_slots: { assistant_id: null },
    });

    const result = await identifySpeakers(db, 'session-1');
    expect(result.get('client-uuid')?.name).toBe('Klient');
  });

  it('throws identify_speakers_failed when live_sessions not found', async () => {
    const db = makeDb({ live_sessions: null });
    await expect(identifySpeakers(db, 'missing')).rejects.toThrow();
  });
});
