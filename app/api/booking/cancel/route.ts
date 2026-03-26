import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    // Verify the booking belongs to this user
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, slot_id, status')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return NextResponse.json({ error: 'Cannot cancel this booking' }, { status: 400 });
    }

    // Cancel the booking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Release the slot back to available
    await supabase
      .from('booking_slots')
      .update({ status: 'available', held_for_user: null, held_until: null })
      .eq('id', booking.slot_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Cancel error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
