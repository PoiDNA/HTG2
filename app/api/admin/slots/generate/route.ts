import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { slotEndTime } from '@/lib/booking/constants';
import type { AvailabilityRule } from '@/lib/booking/types';

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

/**
 * Natalia-first slot generation:
 * - Only uses Natalia's availability_rules (start times)
 * - Creates natalia_solo slots (2h) with assistant_id = NULL
 * - Assistants join slots later via the join API
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { date_from, date_to } = await request.json();

  if (!date_from || !date_to) {
    return NextResponse.json({ error: 'date_from and date_to required' }, { status: 400 });
  }

  // Get Natalia's staff member
  const { data: natalia } = await supabase
    .from('staff_members')
    .select('id')
    .eq('slug', 'natalia')
    .eq('is_active', true)
    .single();

  if (!natalia) {
    return NextResponse.json({ error: 'Natalia staff member not found' }, { status: 400 });
  }

  // Fetch Natalia's availability rules
  const { data: allRules } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('staff_id', natalia.id)
    .eq('is_active', true);

  // Fetch Natalia's exceptions in date range
  const { data: allExceptions } = await supabase
    .from('availability_exceptions')
    .select('*')
    .eq('staff_id', natalia.id)
    .gte('exception_date', date_from)
    .lte('exception_date', date_to);

  const rules = allRules ?? [];
  const exceptions = allExceptions ?? [];

  // Build a map: day_of_week -> rules (each rule = one start time)
  const rulesByDay = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    if (!rulesByDay.has(rule.day_of_week)) rulesByDay.set(rule.day_of_week, []);
    rulesByDay.get(rule.day_of_week)!.push(rule);
  }

  // Build exception set
  const exceptionDates = new Set(exceptions.filter(e => e.all_day).map(e => e.exception_date));

  const slotsToInsert: Array<{
    session_type: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    status: string;
    is_extra: boolean;
    assistant_id: null;
  }> = [];

  // Iterate over each date in range
  let currentDate = date_from;
  while (currentDate <= date_to) {
    const dayOfWeek = getDayOfWeek(currentDate);

    if (!exceptionDates.has(currentDate)) {
      const dayRules = rulesByDay.get(dayOfWeek) ?? [];

      for (const rule of dayRules) {
        // Each rule's start_time is one slot start
        const startTime = rule.start_time.slice(0, 5); // HH:MM
        const endTime = slotEndTime(startTime, 'natalia_solo'); // +2h

        slotsToInsert.push({
          session_type: 'natalia_solo',
          slot_date: currentDate,
          start_time: startTime,
          end_time: endTime,
          status: 'available',
          is_extra: false,
          assistant_id: null,
        });
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  if (slotsToInsert.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Filter out conflicts with existing slots
  const { data: existingSlots } = await supabase
    .from('booking_slots')
    .select('slot_date, start_time, end_time')
    .gte('slot_date', date_from)
    .lte('slot_date', date_to)
    .in('status', ['available', 'held', 'booked']);

  const existing = existingSlots ?? [];

  const nonConflicting = slotsToInsert.filter(newSlot => {
    return !existing.some(ex =>
      ex.slot_date === newSlot.slot_date &&
      timeToMin(ex.start_time) < timeToMin(newSlot.end_time) &&
      timeToMin(ex.end_time) > timeToMin(newSlot.start_time)
    );
  });

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
