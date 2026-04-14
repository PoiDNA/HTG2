import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import {
  SESSION_CONFIG,
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  isInterpreterSessionType,
} from '@/lib/booking/constants';
import type { SessionType, TranslatorLocale } from '@/lib/booking/types';

/**
 * GET /api/booking/available-slots
 * Query params:
 *   session_type: SessionType (required)
 *   locale:       'pl' | 'en' | 'de' | 'pt' — picks translator for interpreter types
 *   operator:     assistant slug ('agata' | 'justyna') — required for natalia_interpreter_asysta
 *   from, to:     YYYY-MM-DD range (inclusive). Default: today..today+14d.
 *
 * Returns: { slots: Array<{ id?, slot_date, start_time, end_time, session_type,
 *                           translator_id?, assistant_id?, is_override: boolean }> }
 *
 * Behavior:
 *  - Computes intersection of availability_rules of required staff across the range.
 *  - Subtracts availability_exceptions and existing held/booked slots per resource.
 *  - UNIONs with DB rows (status='available') — DB override wins on (slot_date, start_time).
 *  - Caps start_time to CALENDAR_END_HOUR*60 - duration, per session_type.
 */

type Rule = {
  staff_id: string;
  day_of_week: number;
  start_time: string;  // HH:MM:SS
  end_time: string;
  is_active: boolean;
};

type Exception = {
  staff_id: string;
  exception_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

type BusySlot = {
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  assistant_id: string | null;
  translator_id: string | null;
};

type AvailableSlotDB = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  assistant_id: string | null;
  translator_id: string | null;
  is_extra: boolean;
};

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(iso: string): number {
  // JS Sunday=0 matches DB convention
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const sessionType = params.get('session_type') as SessionType | null;
    const locale = (params.get('locale') || 'pl') as 'pl' | TranslatorLocale;
    const operatorSlug = params.get('operator');
    const from = params.get('from') || todayISO();
    const to = params.get('to') || addDays(from, 14);

    if (!sessionType || !SESSION_CONFIG[sessionType]) {
      return NextResponse.json({ error: 'session_type required and valid' }, { status: 400 });
    }

    const config = SESSION_CONFIG[sessionType];
    const duration = config.durationMinutes;
    const needsTranslator = isInterpreterSessionType(sessionType);
    const needsAssistant =
      sessionType === 'natalia_interpreter_asysta' ||
      sessionType === 'natalia_agata' ||
      sessionType === 'natalia_justyna' ||
      sessionType === 'natalia_przemek';

    // Validate locale vs session type
    if (needsTranslator && locale === 'pl') {
      return NextResponse.json({ error: 'interpreter session types require non-PL locale' }, { status: 400 });
    }

    const db = await createSupabaseServer();

    // Resolve required staff
    const { data: natalia } = await db
      .from('staff_members')
      .select('id, slug, role, locale')
      .eq('slug', 'natalia')
      .eq('is_active', true)
      .single();
    if (!natalia) {
      return NextResponse.json({ error: 'Natalia staff member missing' }, { status: 500 });
    }

    let assistantId: string | null = null;
    let assistantName: string | null = null;
    if (needsAssistant) {
      let slugToFind = operatorSlug;
      if (!slugToFind) {
        if (sessionType === 'natalia_agata') slugToFind = 'agata';
        else if (sessionType === 'natalia_justyna') slugToFind = 'justyna';
        else if (sessionType === 'natalia_przemek') slugToFind = 'przemek';
      }
      if (!slugToFind) {
        return NextResponse.json({ error: 'operator required for this session_type' }, { status: 400 });
      }
      const { data: asst } = await db
        .from('staff_members')
        .select('id, name, slug, role, is_active')
        .eq('slug', slugToFind)
        .eq('is_active', true)
        .single();
      if (!asst || asst.role !== 'assistant') {
        return NextResponse.json({ error: `Assistant '${slugToFind}' not found` }, { status: 404 });
      }
      assistantId = asst.id;
      assistantName = asst.name;
    }

    let translatorId: string | null = null;
    if (needsTranslator) {
      const { data: tr } = await db
        .from('staff_members')
        .select('id, role, locale, is_active')
        .eq('role', 'translator')
        .eq('locale', locale)
        .eq('is_active', true)
        .single();
      if (!tr) {
        return NextResponse.json({ error: `No active translator for locale ${locale}` }, { status: 404 });
      }
      translatorId = tr.id;
    }

    const requiredStaffIds: string[] = [natalia.id];
    if (assistantId) requiredStaffIds.push(assistantId);
    if (translatorId) requiredStaffIds.push(translatorId);

    // Fetch rules, exceptions, busy slots
    const [
      { data: rulesData },
      { data: exceptionsData },
      { data: busyData },
      { data: dbAvailableData },
    ] = await Promise.all([
      db
        .from('availability_rules')
        .select('staff_id, day_of_week, start_time, end_time, is_active')
        .in('staff_id', requiredStaffIds)
        .eq('is_active', true),
      db
        .from('availability_exceptions')
        .select('staff_id, exception_date, all_day, start_time, end_time')
        .in('staff_id', requiredStaffIds)
        .gte('exception_date', from)
        .lte('exception_date', to),
      db
        .from('booking_slots')
        .select('slot_date, start_time, end_time, session_type, assistant_id, translator_id')
        .in('status', ['held', 'booked'])
        .gte('slot_date', from)
        .lte('slot_date', to),
      db
        .from('booking_slots')
        .select('id, slot_date, start_time, end_time, session_type, assistant_id, translator_id, is_extra')
        .eq('status', 'available')
        .eq('session_type', sessionType)
        .gte('slot_date', from)
        .lte('slot_date', to),
    ]);

    const rules: Rule[] = (rulesData ?? []) as Rule[];
    const exceptions: Exception[] = (exceptionsData ?? []) as Exception[];
    const busy: BusySlot[] = (busyData ?? []) as BusySlot[];
    const dbAvailable: AvailableSlotDB[] = (dbAvailableData ?? []) as AvailableSlotDB[];

    // Filter DB-available slots per resource match
    const matchingDbSlots = dbAvailable.filter((s) => {
      if (needsTranslator && s.translator_id !== translatorId) return false;
      if (needsAssistant && assistantId && s.assistant_id !== assistantId) return false;
      return true;
    });

    // DB override keys (slot_date|start_time) — these suppress intersection candidates
    const overrideKeys = new Set(
      matchingDbSlots.map((s) => `${s.slot_date}|${s.start_time.slice(0, 8)}`),
    );

    // Cap start per session_type: last start = CALENDAR_END_HOUR * 60 - duration
    const capStartMin = CALENDAR_END_HOUR * 60 - duration;
    const floorStartMin = CALENDAR_START_HOUR * 60;

    // Compute candidate windows per date
    type Candidate = {
      slot_date: string;
      start_time: string;
      end_time: string;
      session_type: SessionType;
      translator_id: string | null;
      assistant_id: string | null;
      is_override: false;
    };
    const candidates: Candidate[] = [];

    const today = todayISO();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d < today) continue;
      const dow = dayOfWeek(d);

      // For each staff: intersect all their day_of_week rules into a free-time window set
      // (we use one covering rule per staff for simplicity; real intersection of multiple rules).
      const perStaffWindows: Array<Array<[number, number]>> = [];
      let allHaveWindows = true;
      for (const staffId of requiredStaffIds) {
        const staffRules = rules.filter((r) => r.staff_id === staffId && r.day_of_week === dow);
        if (staffRules.length === 0) {
          allHaveWindows = false;
          break;
        }
        const windows: Array<[number, number]> = staffRules.map((r) => [
          hmToMin(r.start_time),
          hmToMin(r.end_time),
        ]);
        perStaffWindows.push(windows);
      }
      if (!allHaveWindows) continue;

      // Intersect windows across staff: simple approach, fold each staff's windows
      // producing the set of time intervals where all staff are covered simultaneously.
      let intersection: Array<[number, number]> = perStaffWindows[0]!;
      for (let i = 1; i < perStaffWindows.length; i++) {
        const next = perStaffWindows[i]!;
        const out: Array<[number, number]> = [];
        for (const [a1, a2] of intersection) {
          for (const [b1, b2] of next) {
            const s = Math.max(a1, b1);
            const e = Math.min(a2, b2);
            if (s < e) out.push([s, e]);
          }
        }
        intersection = out;
        if (intersection.length === 0) break;
      }
      if (intersection.length === 0) continue;

      // Subtract exceptions (per staff). Each exception blocks a date window for one staff —
      // but since we're already at the intersection, any staff's exception shrinks it.
      const dateExceptions = exceptions.filter((e) => e.exception_date === d);
      for (const ex of dateExceptions) {
        if (!requiredStaffIds.includes(ex.staff_id)) continue;
        if (ex.all_day) {
          intersection = [];
          break;
        }
        if (ex.start_time && ex.end_time) {
          const bStart = hmToMin(ex.start_time);
          const bEnd = hmToMin(ex.end_time);
          const out: Array<[number, number]> = [];
          for (const [a1, a2] of intersection) {
            if (a2 <= bStart || a1 >= bEnd) {
              out.push([a1, a2]);
            } else {
              if (a1 < bStart) out.push([a1, bStart]);
              if (bEnd < a2) out.push([bEnd, a2]);
            }
          }
          intersection = out;
        }
      }
      if (intersection.length === 0) continue;

      // Subtract busy slots per resource
      const dateBusy = busy.filter((b) => b.slot_date === d);
      const effectiveBusy: Array<[number, number]> = [];
      for (const b of dateBusy) {
        const bStart = hmToMin(b.start_time);
        const bEnd = hmToMin(b.end_time);
        // Natalia is busy for all non-pre_session
        const natBusy = b.session_type !== 'pre_session';
        const asstBusy = !!assistantId && b.assistant_id === assistantId;
        const trBusy = !!translatorId && b.translator_id === translatorId;
        if (natBusy || asstBusy || trBusy) {
          effectiveBusy.push([bStart, bEnd]);
        }
      }
      for (const [bStart, bEnd] of effectiveBusy) {
        const out: Array<[number, number]> = [];
        for (const [a1, a2] of intersection) {
          if (a2 <= bStart || a1 >= bEnd) {
            out.push([a1, a2]);
          } else {
            if (a1 < bStart) out.push([a1, bStart]);
            if (bEnd < a2) out.push([bEnd, a2]);
          }
        }
        intersection = out;
        if (intersection.length === 0) break;
      }
      if (intersection.length === 0) continue;

      // Emit candidate slots at 30-min starts fitting `duration` in each window.
      // Respect calendar grid and per-type cap.
      for (const [a1, a2] of intersection) {
        const firstStart = Math.max(a1, floorStartMin);
        const lastPossible = Math.min(a2 - duration, capStartMin);
        // Snap firstStart to :00 or :30
        const snappedFirst = Math.ceil(firstStart / 30) * 30;
        for (let s = snappedFirst; s <= lastPossible; s += 30) {
          const start = minToHm(s);
          const key = `${d}|${start}`;
          if (overrideKeys.has(key)) continue;
          candidates.push({
            slot_date: d,
            start_time: start,
            end_time: minToHm(s + duration),
            session_type: sessionType,
            translator_id: translatorId,
            assistant_id: assistantId,
            is_override: false,
          });
        }
      }
    }

    // Emit DB override rows as-is
    const overrides = matchingDbSlots.map((s) => ({
      id: s.id,
      slot_date: s.slot_date,
      start_time: s.start_time.slice(0, 8),
      end_time: s.end_time.slice(0, 8),
      session_type: s.session_type as SessionType,
      translator_id: s.translator_id,
      assistant_id: s.assistant_id,
      is_override: true as const,
      is_extra: s.is_extra,
    }));

    const slots = [...overrides, ...candidates].sort((a, b) => {
      if (a.slot_date !== b.slot_date) return a.slot_date < b.slot_date ? -1 : 1;
      return a.start_time < b.start_time ? -1 : 1;
    });

    return NextResponse.json({
      slots,
      meta: {
        session_type: sessionType,
        locale,
        duration_minutes: duration,
        translator_id: translatorId,
        assistant_id: assistantId,
        assistant_name: assistantName,
        from,
        to,
      },
    });
  } catch (err: any) {
    console.error('available-slots error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
