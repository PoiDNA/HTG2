import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canEditSesje } from '@/lib/staff-config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEditSesje(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createSupabaseServiceRole();

  // Fetch booking with slot info
  const { data: booking, error: fetchErr } = await db
    .from('bookings')
    .select('slot_id, proposed_slot_date, proposed_start_time, reschedule_status')
    .eq('id', id)
    .single();

  if (fetchErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.reschedule_status !== 'pending' || !booking.proposed_slot_date || !booking.proposed_start_time) {
    return NextResponse.json({ error: 'No pending proposal' }, { status: 400 });
  }

  // Fetch current slot to compute duration
  let proposedEndTime: string | null = null;
  if (booking.slot_id) {
    const { data: slot } = await db
      .from('booking_slots')
      .select('start_time, end_time')
      .eq('id', booking.slot_id)
      .single();

    if (slot?.start_time && slot?.end_time) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      const durationMins = (eh * 60 + em) - (sh * 60 + sm);
      const [ph, pm] = booking.proposed_start_time.split(':').map(Number);
      const endTotalMins = ph * 60 + pm + durationMins;
      proposedEndTime = `${String(Math.floor(endTotalMins / 60)).padStart(2, '0')}:${String(endTotalMins % 60).padStart(2, '0')}:00`;
    }
  }

  // Update booking_slot to the new date/time
  if (booking.slot_id) {
    const slotUpdate: Record<string, string> = {
      slot_date: booking.proposed_slot_date,
      start_time: booking.proposed_start_time,
    };
    if (proposedEndTime) slotUpdate.end_time = proposedEndTime;

    const { error: slotErr } = await db
      .from('booking_slots')
      .update(slotUpdate)
      .eq('id', booking.slot_id);

    if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 });
  }

  // Clear proposal on booking
  const { error: bookingErr } = await db
    .from('bookings')
    .update({
      proposed_slot_date: null,
      proposed_start_time: null,
      reschedule_status: null,
    })
    .eq('id', id);

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
