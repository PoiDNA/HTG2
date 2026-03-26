import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId, sharingMode, invitedEmails = [] } = await request.json();
  if (!bookingId || !sharingMode) {
    return NextResponse.json({ error: 'bookingId and sharingMode required' }, { status: 400 });
  }

  // Verify booking belongs to user
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id')
    .eq('id', bookingId)
    .single();

  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (sharingMode === 'private') {
    // Deactivate sharing
    await supabase
      .from('session_sharing')
      .update({ is_active: false })
      .eq('booking_id', bookingId);

    await supabase
      .from('bookings')
      .update({ sharing_mode: null })
      .eq('id', bookingId);

    return NextResponse.json({ success: true, mode: 'private' });
  }

  // Upsert sharing config
  const { data, error } = await supabase
    .from('session_sharing')
    .upsert({
      booking_id: bookingId,
      sharing_mode: sharingMode,
      invited_emails: sharingMode === 'invited' ? invitedEmails : [],
      is_active: true,
    }, { onConflict: 'booking_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from('bookings')
    .update({ sharing_mode: sharingMode })
    .eq('id', bookingId);

  return NextResponse.json({ success: true, sharing: data });
}
