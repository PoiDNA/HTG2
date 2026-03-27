import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { PRE_SESSION_DURATION } from '@/lib/booking/constants';

// GET: available pre-session slots for client (requires eligibility)
// or list own slots for assistant (staff view)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const staffMemberId = searchParams.get('staffMemberId');
  const month = searchParams.get('month'); // YYYY-MM

  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  const isAssistant = staffMember?.role === 'assistant';

  let query = db
    .from('booking_slots')
    .select('id, slot_date, start_time, end_time, status, assistant_id, notes, assistant:staff_members!booking_slots_assistant_id_fkey(id, name, slug)')
    .eq('session_type', 'pre_session')
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (isAssistant) {
    // Staff sees their own pre-session slots
    query = query.eq('assistant_id', staffMember!.id);
  } else {
    // Client sees only available slots for their eligible assistant
    if (!staffMemberId) return NextResponse.json({ error: 'staffMemberId required' }, { status: 400 });

    // Verify eligibility
    const { data: eligibility } = await db
      .from('pre_session_eligibility')
      .select('id')
      .eq('user_id', user.id)
      .eq('staff_member_id', staffMemberId)
      .eq('is_active', true)
      .eq('meeting_booked', false)
      .maybeSingle();

    if (!eligibility) return NextResponse.json({ error: 'Not eligible' }, { status: 403 });

    query = query
      .eq('assistant_id', staffMemberId)
      .eq('status', 'available')
      .gte('slot_date', new Date().toISOString().split('T')[0]);
  }

  if (month) {
    query = query
      .gte('slot_date', `${month}-01`)
      .lte('slot_date', `${month}-31`);
  }

  const { data: slots, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ slots: slots ?? [] });
}

// POST: assistant creates a pre-session slot
export async function POST(request: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'assistant') {
    return NextResponse.json({ error: 'Not an assistant' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { date, startTime, notes } = await request.json();

  if (!date || !startTime) {
    return NextResponse.json({ error: 'date and startTime required' }, { status: 400 });
  }

  // Calculate end time (15 minutes)
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + PRE_SESSION_DURATION;
  const endTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

  // Check for conflict with own slots
  const { data: conflict } = await db
    .from('booking_slots')
    .select('id')
    .eq('assistant_id', staffMember.id)
    .eq('slot_date', date)
    .eq('session_type', 'pre_session')
    .neq('status', 'cancelled')
    .lte('start_time', startTime)
    .gt('end_time', startTime)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: 'Konflikt z istniejącym terminem' }, { status: 409 });
  }

  const { data: slot, error } = await db
    .from('booking_slots')
    .insert({
      session_type: 'pre_session',
      slot_date: date,
      start_time: startTime,
      end_time: endTime,
      status: 'available',
      assistant_id: staffMember.id,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ slot });
}

// DELETE: assistant removes own pre-session slot (only if still available)
export async function DELETE(request: NextRequest) {
  const { user, staffMember } = await getEffectiveStaffMember();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staffMember || staffMember.role !== 'assistant') {
    return NextResponse.json({ error: 'Not an assistant' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();
  const { slotId } = await request.json();

  const { data: slot } = await db
    .from('booking_slots')
    .select('id, status')
    .eq('id', slotId)
    .eq('assistant_id', staffMember.id)
    .eq('session_type', 'pre_session')
    .single();

  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  if (slot.status === 'booked') {
    return NextResponse.json({ error: 'Nie można usunąć zarezerwowanego terminu' }, { status: 409 });
  }

  await db.from('booking_slots').update({ status: 'cancelled' }).eq('id', slotId);

  return NextResponse.json({ ok: true });
}
