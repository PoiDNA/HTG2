import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

/**
 * GET /api/staff/my-bookings
 * Returns bookings where the current staff member is the assistant or translator on the slot.
 * Used by AssistantEditor and TranslatorSessionsPage to show "booked with me".
 */
export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { supabase, staffMember } = auth;

  if (!staffMember) {
    return NextResponse.json({ bookings: [] });
  }

  const { data, error } = await supabase
    .from('booking_slots')
    .select(`
      id, slot_date, start_time, end_time, session_type, status,
      assistant_id, translator_id,
      bookings!inner(
        id, status, payment_status, topics,
        user:profiles!bookings_user_id_fkey(display_name, email)
      )
    `)
    .or(`assistant_id.eq.${staffMember.id},translator_id.eq.${staffMember.id}`)
    .in('status', ['held', 'booked', 'completed'])
    .order('slot_date', { ascending: false })
    .limit(200);

  if (error) {
    console.error('my-bookings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten: each slot row → one booking row (inner join guarantees exactly one booking per slot)
  const bookings = (data || []).map((slot: any) => {
    const booking = Array.isArray(slot.bookings) ? slot.bookings[0] : slot.bookings;
    return {
      slot_id: slot.id,
      slot_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      session_type: slot.session_type,
      slot_status: slot.status,
      booking_id: booking?.id,
      booking_status: booking?.status,
      payment_status: booking?.payment_status,
      topics: booking?.topics,
      client_name: booking?.user?.display_name || booking?.user?.email || '—',
      client_email: booking?.user?.email || null,
    };
  });

  return NextResponse.json({ bookings });
}
