import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import {
  SESSION_CONFIG,
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  isInterpreterSessionType,
  slotEndTime,
} from '@/lib/booking/constants';
import type { SessionType, TranslatorLocale } from '@/lib/booking/types';

/**
 * GET /api/booking/available-slots
 * Query params:
 *   session_type: SessionType (required)
 *   locale:       'pl' | 'en' | 'de' | 'pt'
 *   operator:     assistant slug — optional for asysta types (returns available_operators[] per slot)
 *   from, to:     YYYY-MM-DD range (inclusive). Default: today..today+14d (28d for asysta).
 *
 * Returns: { slots: Array<{ id?, slot_date, start_time, end_time, effective_end_time?,
 *                           session_type, translator_id?, assistant_id?,
 *                           available_operators?: [{id,name,slug}], is_override: boolean }> }
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
  solo_locked?: boolean;
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
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check if a single staff member is available for a given slot time window */
function isStaffAvailable(
  staffId: string,
  slotDate: string,
  slotStartMin: number,
  slotEndMin: number,
  rules: Rule[],
  exceptions: Exception[],
  busy: BusySlot[],
  isNatalia = false,
): boolean {
  const dow = dayOfWeek(slotDate);

  // Must have a rule covering the window
  const staffRules = rules.filter(
    (r) => r.staff_id === staffId && r.day_of_week === dow
  );
  const covered = staffRules.some(
    (r) => hmToMin(r.start_time) <= slotStartMin && hmToMin(r.end_time) >= slotEndMin
  );
  if (!covered) return false;

  // Must not be blocked by an exception
  const dateExceptions = exceptions.filter(
    (e) => e.staff_id === staffId && e.exception_date === slotDate
  );
  for (const ex of dateExceptions) {
    if (ex.all_day) return false;
    if (ex.start_time && ex.end_time) {
      if (overlaps(slotStartMin, slotEndMin, hmToMin(ex.start_time), hmToMin(ex.end_time))) return false;
    }
  }

  // Must not have a conflicting busy slot
  const dateBusy = busy.filter((b) => b.slot_date === slotDate);
  for (const b of dateBusy) {
    const bStart = hmToMin(b.start_time);
    const bEnd = hmToMin(b.end_time);
    if (!overlaps(slotStartMin, slotEndMin, bStart, bEnd)) continue;
    // Check if this staff is a resource in the busy slot
    const isResource = isNatalia
      ? b.session_type !== 'pre_session'
      : b.assistant_id === staffId || b.translator_id === staffId;
    if (isResource) return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const sessionType = params.get('session_type') as SessionType | null;
    const locale = (params.get('locale') || 'pl') as 'pl' | TranslatorLocale;
    const operatorSlug = params.get('operator');
    const from = params.get('from') || todayISO();

    if (!sessionType || !SESSION_CONFIG[sessionType]) {
      return NextResponse.json({ error: 'session_type required and valid' }, { status: 400 });
    }

    const config = SESSION_CONFIG[sessionType];
    const duration = config.durationMinutes;
    const isAsysta = sessionType === 'natalia_asysta' || sessionType === 'natalia_interpreter_asysta';

    // Default window: 28d for asysta (batch intersection), 14d otherwise
    const defaultDays = isAsysta ? 28 : 14;
    const to = params.get('to') || addDays(from, defaultDays);

    const needsTranslator = isInterpreterSessionType(sessionType);

    // Validate locale vs session type
    if (needsTranslator && locale === 'pl') {
      return NextResponse.json({ error: 'interpreter session types require non-PL locale' }, { status: 400 });
    }

    const db = await createSupabaseServer();

    // ── PL direct types: natalia_solo, natalia_para ──────────────────────────
    // These slots are manually created by Natalia/admin; just query DB directly.
    if (sessionType === 'natalia_solo' || sessionType === 'natalia_para') {
      const { data: slotsData } = await db
        .from('booking_slots')
        .select('id, slot_date, start_time, end_time, session_type, assistant_id, translator_id, is_extra')
        .eq('session_type', sessionType)
        .eq('status', 'available')
        .gte('slot_date', from)
        .lte('slot_date', to)
        .order('slot_date')
        .order('start_time');

      const slots = (slotsData ?? []).map((s) => ({
        id: s.id,
        slot_date: s.slot_date,
        start_time: s.start_time.slice(0, 8),
        end_time: s.end_time.slice(0, 8),
        session_type: s.session_type,
        translator_id: s.translator_id,
        assistant_id: s.assistant_id,
        is_override: true,
        is_extra: s.is_extra,
      }));

      return NextResponse.json({
        slots,
        meta: { session_type: sessionType, locale, duration_minutes: duration, from, to },
      });
    }

    // ── natalia_asysta (PL): natalia_solo base slots × available assistants ──
    if (sessionType === 'natalia_asysta') {
      // 1. Fetch Natalia's available solo slots (not solo_locked)
      const { data: baseSlotsData } = await db
        .from('booking_slots')
        .select('id, slot_date, start_time, end_time, session_type, is_extra')
        .eq('session_type', 'natalia_solo')
        .eq('status', 'available')
        .eq('solo_locked', false)
        .gte('slot_date', from)
        .lte('slot_date', to)
        .order('slot_date')
        .order('start_time');

      const baseSlots = baseSlotsData ?? [];
      if (baseSlots.length === 0) {
        return NextResponse.json({
          slots: [],
          meta: { session_type: sessionType, locale, duration_minutes: duration, from, to },
        });
      }

      // 2. Fetch all active operators
      const { data: assistantsData } = await db
        .from('staff_members')
        .select('id, name, slug')
        .eq('role', 'operator')
        .eq('is_active', true);

      const assistants = assistantsData ?? [];
      if (assistants.length === 0) {
        return NextResponse.json({
          slots: [],
          meta: { session_type: sessionType, locale, duration_minutes: duration, from, to },
        });
      }

      const assistantIds = assistants.map((a) => a.id);

      // 3. Batch fetch rules, exceptions, busy slots for all assistants
      const [
        { data: rulesData },
        { data: exceptionsData },
        { data: busyData },
      ] = await Promise.all([
        db.from('availability_rules')
          .select('staff_id, day_of_week, start_time, end_time, is_active')
          .in('staff_id', assistantIds)
          .eq('is_active', true),
        db.from('availability_exceptions')
          .select('staff_id, exception_date, all_day, start_time, end_time')
          .in('staff_id', assistantIds)
          .gte('exception_date', from)
          .lte('exception_date', to),
        db.from('booking_slots')
          .select('slot_date, start_time, end_time, session_type, assistant_id, translator_id')
          .in('assistant_id', assistantIds)
          .in('status', ['held', 'booked'])
          .gte('slot_date', from)
          .lte('slot_date', to),
      ]);

      const rules: Rule[] = (rulesData ?? []) as Rule[];
      const exceptions: Exception[] = (exceptionsData ?? []) as Exception[];
      const busy: BusySlot[] = (busyData ?? []) as BusySlot[];

      // 4. Per slot: compute available_operators
      const asystaDuration = config.durationMinutes;
      const slots = baseSlots
        .map((slot) => {
          const slotStartMin = hmToMin(slot.start_time);
          const slotEndMin = slotStartMin + asystaDuration;
          const effectiveEndTime = slotEndTime(slot.start_time, 'natalia_asysta');

          const availableOps = assistants.filter((asst) =>
            isStaffAvailable(
              asst.id,
              slot.slot_date,
              slotStartMin,
              slotEndMin,
              rules,
              exceptions,
              busy,
            )
          ).map((a) => ({ id: a.id, name: a.name, slug: a.slug }));

          return {
            id: slot.id,
            slot_date: slot.slot_date,
            start_time: slot.start_time.slice(0, 8),
            end_time: slot.end_time.slice(0, 8),
            effective_end_time: effectiveEndTime + ':00',
            session_type: slot.session_type,
            available_operators: availableOps,
            is_override: true,
            is_extra: slot.is_extra,
          };
        })
        .filter((s) => s.available_operators.length > 0);

      // 5. If operator filter requested, narrow to single operator
      const filteredSlots = operatorSlug
        ? slots.map((s) => ({
            ...s,
            available_operators: s.available_operators.filter((op) => op.slug === operatorSlug),
          })).filter((s) => s.available_operators.length > 0)
        : slots;

      return NextResponse.json({
        slots: filteredSlots,
        meta: { session_type: sessionType, locale, duration_minutes: duration, from, to },
      });
    }

    // ── Interpreter types (EN/DE/PT) ─────────────────────────────────────────

    // Resolve Natalia
    const { data: natalia } = await db
      .from('staff_members')
      .select('id, slug, role, locale')
      .eq('slug', 'natalia')
      .eq('is_active', true)
      .single();
    if (!natalia) {
      return NextResponse.json({ error: 'Natalia staff member missing' }, { status: 500 });
    }

    // Resolve translator
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

    // natalia_interpreter_asysta: operator optional → return available_operators[] per slot
    if (sessionType === 'natalia_interpreter_asysta') {
      // Fetch all active operators
      const { data: assistantsData } = await db
        .from('staff_members')
        .select('id, name, slug')
        .eq('role', 'operator')
        .eq('is_active', true);
      const assistants = assistantsData ?? [];

      // Fetch rules/exceptions/busy for natalia + translator + all assistants
      const staffForIntersection = [natalia.id, ...(translatorId ? [translatorId] : [])];
      const assistantIds = assistants.map((a) => a.id);
      const allStaffIds = [...staffForIntersection, ...assistantIds];

      const [
        { data: rulesData },
        { data: exceptionsData },
        { data: busyData },
        { data: dbAvailableData },
      ] = await Promise.all([
        db.from('availability_rules')
          .select('staff_id, day_of_week, start_time, end_time, is_active')
          .in('staff_id', allStaffIds)
          .eq('is_active', true),
        db.from('availability_exceptions')
          .select('staff_id, exception_date, all_day, start_time, end_time')
          .in('staff_id', allStaffIds)
          .gte('exception_date', from)
          .lte('exception_date', to),
        db.from('booking_slots')
          .select('slot_date, start_time, end_time, session_type, assistant_id, translator_id')
          .in('status', ['held', 'booked'])
          .gte('slot_date', from)
          .lte('slot_date', to),
        db.from('booking_slots')
          .select('id, slot_date, start_time, end_time, session_type, assistant_id, translator_id, is_extra, solo_locked')
          .eq('status', 'available')
          .eq('session_type', 'natalia_interpreter_asysta')
          .eq('solo_locked', false)
          .gte('slot_date', from)
          .lte('slot_date', to),
      ]);

      const rules: Rule[] = (rulesData ?? []) as Rule[];
      const exceptions: Exception[] = (exceptionsData ?? []) as Exception[];
      const busy: BusySlot[] = (busyData ?? []) as BusySlot[];
      const dbOverrides: AvailableSlotDB[] = (dbAvailableData ?? []) as AvailableSlotDB[];

      // Compute intersection slots for natalia + translator
      const coreStaff = [natalia.id, ...(translatorId ? [translatorId] : [])];
      const overrideKeys = new Set(dbOverrides.map((s) => `${s.slot_date}|${s.start_time.slice(0, 8)}`));
      const capStartMin = CALENDAR_END_HOUR * 60 - duration;
      const floorStartMin = CALENDAR_START_HOUR * 60;
      const today = todayISO();

      type InterpreterAsystaSlot = {
        id?: string;
        slot_date: string;
        start_time: string;
        end_time: string;
        effective_end_time: string;
        session_type: string;
        translator_id: string | null;
        available_operators: { id: string; name: string; slug: string }[];
        is_override: boolean;
        is_extra?: boolean;
      };

      const computedSlots: InterpreterAsystaSlot[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (d < today) continue;
        const dow = dayOfWeek(d);

        // Intersection for core staff (natalia + translator)
        const perStaffWindows: Array<Array<[number, number]>> = [];
        let allHaveWindows = true;
        for (const staffId of coreStaff) {
          const staffRules = rules.filter((r) => r.staff_id === staffId && r.day_of_week === dow);
          if (staffRules.length === 0) { allHaveWindows = false; break; }
          perStaffWindows.push(staffRules.map((r) => [hmToMin(r.start_time), hmToMin(r.end_time)]));
        }
        if (!allHaveWindows) continue;

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

        // Subtract exceptions for core staff
        const dateExceptions = exceptions.filter((e) => coreStaff.includes(e.staff_id) && e.exception_date === d);
        for (const ex of dateExceptions) {
          if (ex.all_day) { intersection = []; break; }
          if (ex.start_time && ex.end_time) {
            const bStart = hmToMin(ex.start_time);
            const bEnd = hmToMin(ex.end_time);
            intersection = intersection.flatMap(([a1, a2]) => {
              if (a2 <= bStart || a1 >= bEnd) return [[a1, a2]];
              const out: [number, number][] = [];
              if (a1 < bStart) out.push([a1, bStart]);
              if (bEnd < a2) out.push([bEnd, a2]);
              return out;
            });
          }
        }
        if (intersection.length === 0) continue;

        // Subtract busy for core staff
        const dateBusy = busy.filter((b) => b.slot_date === d);
        for (const b of dateBusy) {
          const bStart = hmToMin(b.start_time);
          const bEnd = hmToMin(b.end_time);
          const natBusy = b.session_type !== 'pre_session';
          const trBusy = !!translatorId && b.translator_id === translatorId;
          if (!natBusy && !trBusy) continue;
          intersection = intersection.flatMap(([a1, a2]) => {
            if (!overlaps(a1, a2, bStart, bEnd)) return [[a1, a2]];
            const out: [number, number][] = [];
            if (a1 < bStart) out.push([a1, bStart]);
            if (bEnd < a2) out.push([bEnd, a2]);
            return out;
          });
          if (intersection.length === 0) break;
        }
        if (intersection.length === 0) continue;

        for (const [a1, a2] of intersection) {
          const firstStart = Math.max(a1, floorStartMin);
          const lastPossible = Math.min(a2 - duration, capStartMin);
          const snappedFirst = Math.ceil(firstStart / 30) * 30;
          for (let s = snappedFirst; s <= lastPossible; s += 30) {
            const startStr = minToHm(s);
            const key = `${d}|${startStr}`;
            if (overrideKeys.has(key)) continue;

            // Compute available_operators for this slot
            const slotEndMin = s + duration;
            const availableOps = assistants.filter((asst) =>
              isStaffAvailable(asst.id, d, s, slotEndMin, rules, exceptions, busy)
            ).map((a) => ({ id: a.id, name: a.name, slug: a.slug }));

            computedSlots.push({
              slot_date: d,
              start_time: startStr,
              end_time: minToHm(s + duration),
              effective_end_time: slotEndTime(startStr, 'natalia_interpreter_asysta') + ':00',
              session_type: sessionType,
              translator_id: translatorId,
              available_operators: availableOps,
              is_override: false,
            });
          }
        }
      }

      // DB overrides with available_operators computed
      const overrideSlots = dbOverrides.map((s) => {
        const slotStartMin = hmToMin(s.start_time);
        const slotEndMin = slotStartMin + duration;
        const availableOps = assistants.filter((asst) =>
          isStaffAvailable(asst.id, s.slot_date, slotStartMin, slotEndMin, rules, exceptions, busy)
        ).map((a) => ({ id: a.id, name: a.name, slug: a.slug }));
        return {
          id: s.id,
          slot_date: s.slot_date,
          start_time: s.start_time.slice(0, 8),
          end_time: s.end_time.slice(0, 8),
          effective_end_time: slotEndTime(s.start_time, 'natalia_interpreter_asysta') + ':00',
          session_type: s.session_type,
          translator_id: s.translator_id,
          available_operators: availableOps,
          is_override: true,
          is_extra: s.is_extra,
        };
      });

      let allSlots = [...overrideSlots, ...computedSlots].sort((a, b) => {
        if (a.slot_date !== b.slot_date) return a.slot_date < b.slot_date ? -1 : 1;
        return a.start_time < b.start_time ? -1 : 1;
      });

      // Filter by operator slug if specified (backward compat)
      if (operatorSlug) {
        allSlots = allSlots
          .map((s) => ({ ...s, available_operators: s.available_operators.filter((op) => op.slug === operatorSlug) }))
          .filter((s) => s.available_operators.length > 0);
      }

      return NextResponse.json({
        slots: allSlots,
        meta: { session_type: sessionType, locale, duration_minutes: duration, translator_id: translatorId, from, to },
      });
    }

    // ── Standard interpreter types (solo, para) — existing intersection logic ─

    let assistantId: string | null = null;
    let assistantName: string | null = null;

    // Legacy PL per-operator types (kept for backward compat with historic data)
    const needsAssistant =
      sessionType === 'natalia_agata' ||
      sessionType === 'natalia_justyna' ||
      sessionType === 'natalia_przemek';

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
      if (!asst || asst.role !== 'operator') {
        return NextResponse.json({ error: `Operator '${slugToFind}' not found` }, { status: 404 });
      }
      assistantId = asst.id;
      assistantName = asst.name;
    }

    const requiredStaffIds: string[] = [natalia.id];
    if (assistantId) requiredStaffIds.push(assistantId);
    if (translatorId) requiredStaffIds.push(translatorId);

    const [
      { data: rulesData },
      { data: exceptionsData },
      { data: busyData },
      { data: dbAvailableData },
    ] = await Promise.all([
      db.from('availability_rules')
        .select('staff_id, day_of_week, start_time, end_time, is_active')
        .in('staff_id', requiredStaffIds)
        .eq('is_active', true),
      db.from('availability_exceptions')
        .select('staff_id, exception_date, all_day, start_time, end_time')
        .in('staff_id', requiredStaffIds)
        .gte('exception_date', from)
        .lte('exception_date', to),
      db.from('booking_slots')
        .select('slot_date, start_time, end_time, session_type, assistant_id, translator_id')
        .in('status', ['held', 'booked'])
        .gte('slot_date', from)
        .lte('slot_date', to),
      db.from('booking_slots')
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

    const matchingDbSlots = dbAvailable.filter((s) => {
      if (needsTranslator && s.translator_id !== translatorId) return false;
      if (needsAssistant && assistantId && s.assistant_id !== assistantId) return false;
      return true;
    });

    const overrideKeys = new Set(
      matchingDbSlots.map((s) => `${s.slot_date}|${s.start_time.slice(0, 8)}`),
    );

    const capStartMin = CALENDAR_END_HOUR * 60 - duration;
    const floorStartMin = CALENDAR_START_HOUR * 60;

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

      const perStaffWindows: Array<Array<[number, number]>> = [];
      let allHaveWindows = true;
      for (const staffId of requiredStaffIds) {
        const staffRules = rules.filter((r) => r.staff_id === staffId && r.day_of_week === dow);
        if (staffRules.length === 0) { allHaveWindows = false; break; }
        perStaffWindows.push(staffRules.map((r) => [hmToMin(r.start_time), hmToMin(r.end_time)]));
      }
      if (!allHaveWindows) continue;

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

      const dateExceptions = exceptions.filter((e) => e.exception_date === d);
      for (const ex of dateExceptions) {
        if (!requiredStaffIds.includes(ex.staff_id)) continue;
        if (ex.all_day) { intersection = []; break; }
        if (ex.start_time && ex.end_time) {
          const bStart = hmToMin(ex.start_time);
          const bEnd = hmToMin(ex.end_time);
          const out: Array<[number, number]> = [];
          for (const [a1, a2] of intersection) {
            if (a2 <= bStart || a1 >= bEnd) { out.push([a1, a2]); continue; }
            if (a1 < bStart) out.push([a1, bStart]);
            if (bEnd < a2) out.push([bEnd, a2]);
          }
          intersection = out;
        }
      }
      if (intersection.length === 0) continue;

      const dateBusy = busy.filter((b) => b.slot_date === d);
      const effectiveBusy: Array<[number, number]> = [];
      for (const b of dateBusy) {
        const bStart = hmToMin(b.start_time);
        const bEnd = hmToMin(b.end_time);
        const natBusy = b.session_type !== 'pre_session';
        const asstBusy = !!assistantId && b.assistant_id === assistantId;
        const trBusy = !!translatorId && b.translator_id === translatorId;
        if (natBusy || asstBusy || trBusy) effectiveBusy.push([bStart, bEnd]);
      }
      for (const [bStart, bEnd] of effectiveBusy) {
        const out: Array<[number, number]> = [];
        for (const [a1, a2] of intersection) {
          if (a2 <= bStart || a1 >= bEnd) { out.push([a1, a2]); continue; }
          if (a1 < bStart) out.push([a1, bStart]);
          if (bEnd < a2) out.push([bEnd, a2]);
        }
        intersection = out;
        if (intersection.length === 0) break;
      }
      if (intersection.length === 0) continue;

      for (const [a1, a2] of intersection) {
        const firstStart = Math.max(a1, floorStartMin);
        const lastPossible = Math.min(a2 - duration, capStartMin);
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
