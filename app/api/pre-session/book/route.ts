import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const { slotId, staffMemberId } = await request.json();

  if (!slotId || !staffMemberId) {
    return NextResponse.json({ error: 'slotId and staffMemberId required' }, { status: 400 });
  }

  // Verify eligibility
  const { data: eligibility } = await db
    .from('pre_session_eligibility')
    .select('id, meeting_booked')
    .eq('user_id', user.id)
    .eq('staff_member_id', staffMemberId)
    .eq('is_active', true)
    .maybeSingle();

  if (!eligibility) {
    return NextResponse.json({ error: 'Brak uprawnień do rezerwacji spotkania wstępnego' }, { status: 403 });
  }
  if (eligibility.meeting_booked) {
    return NextResponse.json({ error: 'Spotkanie wstępne zostało już zarezerwowane' }, { status: 409 });
  }

  // Lock slot and verify it's still available
  const { data: slot } = await db
    .from('booking_slots')
    .select('id, status, slot_date, start_time, end_time, assistant_id')
    .eq('id', slotId)
    .eq('session_type', 'pre_session')
    .eq('assistant_id', staffMemberId)
    .eq('status', 'available')
    .single();

  if (!slot) {
    return NextResponse.json({ error: 'Termin niedostępny — wybierz inny' }, { status: 409 });
  }

  // Check slot is in the future
  const slotDateTime = new Date(`${slot.slot_date}T${slot.start_time}`);
  if (slotDateTime <= new Date()) {
    return NextResponse.json({ error: 'Wybrany termin już minął' }, { status: 409 });
  }

  // Mark slot as booked
  await db
    .from('booking_slots')
    .update({ status: 'booked' })
    .eq('id', slotId);

  // Create booking (confirmed immediately — no payment needed)
  const { data: booking, error: bookingError } = await db
    .from('bookings')
    .insert({
      user_id: user.id,
      slot_id: slotId,
      session_type: 'pre_session',
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (bookingError) {
    // Rollback slot status
    await db.from('booking_slots').update({ status: 'available' }).eq('id', slotId);
    return NextResponse.json({ error: bookingError.message }, { status: 500 });
  }

  // Mark eligibility as booked + link the booking
  await db
    .from('pre_session_eligibility')
    .update({ meeting_booked: true, pre_booking_id: booking.id })
    .eq('id', eligibility.id);

  return NextResponse.json({ booking, slot });
}
