import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';
import { slotEndTime } from '@/lib/booking/constants';

// Helper: auto-generate booking_slots for a new rule (next 8 weeks)
async function generateSlotsForRule(
  supabase: any,
  rule: { day_of_week: number; start_time: string; solo_only: boolean }
) {
  const today = new Date();
  const startTimeClean = rule.start_time.slice(0, 5);
  const endTime = slotEndTime(startTimeClean, 'natalia_solo');
  let created = 0;

  for (let d = 0; d < 56; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    if (date.getDay() !== rule.day_of_week) continue;

    const dateStr = date.toISOString().split('T')[0];

    // Skip if slot already exists for this date+time
    const { data: existing } = await supabase
      .from('booking_slots')
      .select('id')
      .eq('slot_date', dateStr)
      .eq('start_time', rule.start_time)
      .maybeSingle();

    if (existing) continue;

    await supabase.from('booking_slots').insert({
      session_type: 'natalia_solo',
      slot_date: dateStr,
      start_time: startTimeClean,
      end_time: endTime,
      status: 'available',
      is_extra: false,
      solo_locked: rule.solo_only ?? false,
      assistant_id: null,
    });
    created++;
  }

  return created;
}

// Helper: remove future unbooked slots matching a rule
async function removeSlotsForRule(
  supabase: any,
  rule: { day_of_week: number; start_time: string }
) {
  const today = new Date().toISOString().split('T')[0];
  const startTimeClean = rule.start_time.slice(0, 5);

  // Get all future dates matching this day_of_week
  const { data: slots } = await supabase
    .from('booking_slots')
    .select('id, slot_date')
    .eq('status', 'available')
    .eq('start_time', startTimeClean + ':00')
    .eq('is_extra', false)
    .gte('slot_date', today);

  if (!slots) return 0;

  // Filter by day_of_week
  const toDelete = slots.filter((s: any) => {
    const d = new Date(s.slot_date);
    return d.getDay() === rule.day_of_week;
  });

  if (toDelete.length === 0) return 0;

  const ids = toDelete.map((s: any) => s.id);
  await supabase.from('booking_slots').delete().in('id', ids);

  return ids.length;
}

export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { data: rules, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('staff_id', staffMember.id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const { day_of_week, start_time, end_time, solo_only } = await request.json();

  if (day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from('availability_rules')
    .insert({
      staff_id: staffMember.id,
      day_of_week,
      start_time,
      end_time,
      is_active: true,
      solo_only: solo_only ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-generate booking_slots only for the practitioner (Natalia).
  // Assistants and translators contribute availability for intersection;
  // their rules do not spawn standalone slots.
  let created = 0;
  if (staffMember.role === 'practitioner') {
    created = await generateSlotsForRule(supabase, {
      day_of_week,
      start_time,
      solo_only: solo_only ?? false,
    });
  }

  return NextResponse.json({ rule, slots_created: created });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ error: 'No staff member record' }, { status: 400 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Get rule details before deactivating (to remove future slots)
  const { data: rule } = await supabase
    .from('availability_rules')
    .select('day_of_week, start_time')
    .eq('id', id)
    .eq('staff_id', staffMember.id)
    .single();

  // Deactivate rule
  const { error } = await supabase
    .from('availability_rules')
    .update({ is_active: false })
    .eq('id', id)
    .eq('staff_id', staffMember.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Remove future unbooked slots for this rule
  let removed = 0;
  if (rule) {
    removed = await removeSlotsForRule(supabase, rule);
  }

  return NextResponse.json({ success: true, slots_removed: removed });
}
