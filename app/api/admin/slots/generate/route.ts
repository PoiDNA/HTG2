import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType, AvailabilityRule, AvailabilityException } from '@/lib/booking/types';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay();
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Given multiple staff members' rules for the same day_of_week,
 * compute the intersection of their available time windows.
 */
function intersectWindows(
  staffRules: AvailabilityRule[][], // staffRules[staffIdx] = rules for that staff on this day
): Array<{ start: number; end: number }> {
  if (staffRules.length === 0) return [];

  // Convert each staff's rules into merged intervals
  const staffIntervals = staffRules.map(rules => {
    const intervals = rules
      .map(r => ({ start: timeToMin(r.start_time), end: timeToMin(r.end_time) }))
      .sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of intervals) {
      if (merged.length > 0 && iv.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
      } else {
        merged.push({ ...iv });
      }
    }
    return merged;
  });

  // Intersect all staff intervals
  let result = staffIntervals[0];
  for (let i = 1; i < staffIntervals.length; i++) {
    result = intersectTwoIntervalSets(result, staffIntervals[i]);
  }

  return result;
}

function intersectTwoIntervalSets(
  a: Array<{ start: number; end: number }>,
  b: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) {
      result.push({ start, end });
    }
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return result;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { date_from, date_to, session_type } = await request.json();

  if (!date_from || !date_to || !session_type) {
    return NextResponse.json({ error: 'date_from, date_to, session_type required' }, { status: 400 });
  }

  const config = SESSION_CONFIG[session_type as SessionType];
  if (!config) {
    return NextResponse.json({ error: 'Invalid session_type' }, { status: 400 });
  }

  const requiredSlugs = config.requiredStaff;
  const durationMin = config.durationMinutes;

  // Get staff members by slug
  const { data: staffMembers, error: staffErr } = await supabase
    .from('staff_members')
    .select('*')
    .in('slug', requiredSlugs)
    .eq('is_active', true);

  if (staffErr || !staffMembers || staffMembers.length !== requiredSlugs.length) {
    return NextResponse.json({ error: 'Could not find all required staff members' }, { status: 400 });
  }

  const staffIds = staffMembers.map(s => s.id);

  // Fetch availability rules for all staff
  const { data: allRules } = await supabase
    .from('availability_rules')
    .select('*')
    .in('staff_id', staffIds)
    .eq('is_active', true);

  // Fetch exceptions for all staff in date range
  const { data: allExceptions } = await supabase
    .from('availability_exceptions')
    .select('*')
    .in('staff_id', staffIds)
    .gte('exception_date', date_from)
    .lte('exception_date', date_to);

  const rules = allRules ?? [];
  const exceptions = allExceptions ?? [];

  // Build a map: staffId -> day_of_week -> rules
  const ruleMap = new Map<string, Map<number, AvailabilityRule[]>>();
  for (const rule of rules) {
    if (!ruleMap.has(rule.staff_id)) ruleMap.set(rule.staff_id, new Map());
    const dayMap = ruleMap.get(rule.staff_id)!;
    if (!dayMap.has(rule.day_of_week)) dayMap.set(rule.day_of_week, []);
    dayMap.get(rule.day_of_week)!.push(rule);
  }

  // Build a set: staffId:date for exceptions
  const exceptionSet = new Set<string>();
  for (const ex of exceptions) {
    if (ex.all_day) {
      exceptionSet.add(`${ex.staff_id}:${ex.exception_date}`);
    }
  }

  const slotsToInsert: Array<{
    session_type: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    status: string;
    is_extra: boolean;
  }> = [];

  // Iterate over each date in range
  let currentDate = date_from;
  while (currentDate <= date_to) {
    const dayOfWeek = getDayOfWeek(currentDate);

    // Check if any staff member has an exception on this date
    const hasException = staffIds.some(sid => exceptionSet.has(`${sid}:${currentDate}`));

    if (!hasException) {
      // Get rules for each staff member for this day_of_week
      const staffRulesForDay: AvailabilityRule[][] = staffIds.map(sid => {
        const dayMap = ruleMap.get(sid);
        return dayMap?.get(dayOfWeek) ?? [];
      });

      // Check all staff have rules for this day
      const allStaffAvailable = staffRulesForDay.every(r => r.length > 0);

      if (allStaffAvailable) {
        // Compute intersection of available windows
        const windows = intersectWindows(staffRulesForDay);

        // For each window, generate slots of the correct duration
        for (const window of windows) {
          let slotStart = window.start;
          while (slotStart + durationMin <= window.end) {
            slotsToInsert.push({
              session_type,
              slot_date: currentDate,
              start_time: minToTime(slotStart),
              end_time: minToTime(slotStart + durationMin),
              status: 'available',
              is_extra: false,
            });
            slotStart += durationMin;
          }
        }
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  if (slotsToInsert.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Check for natalia conflicts before inserting
  // Fetch existing booked/held slots for natalia in the date range
  if (requiredSlugs.includes('natalia')) {
    const { data: existingSlots } = await supabase
      .from('booking_slots')
      .select('slot_date, start_time, end_time')
      .gte('slot_date', date_from)
      .lte('slot_date', date_to)
      .in('status', ['available', 'held', 'booked']);

    const existing = existingSlots ?? [];

    // Filter out slots that conflict with existing ones on the same date
    const nonConflicting = slotsToInsert.filter(newSlot => {
      return !existing.some(ex =>
        ex.slot_date === newSlot.slot_date &&
        timeToMin(ex.start_time) < timeToMin(newSlot.end_time) &&
        timeToMin(ex.end_time) > timeToMin(newSlot.start_time)
      );
    });

    // Insert only non-conflicting slots
    if (nonConflicting.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const { error: insertErr } = await supabase
      .from('booking_slots')
      .insert(nonConflicting);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ count: nonConflicting.length });
  }

  // Insert all slots
  const { error: insertErr } = await supabase
    .from('booking_slots')
    .insert(slotsToInsert);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ count: slotsToInsert.length });
}
