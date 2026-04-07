import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';
import { createRoom } from '@/lib/live/livekit';
import { generateRoomName } from '@/lib/live/constants';
import type { CreateSessionRequest } from '@/lib/live/types';

export async function POST(request: NextRequest) {
  try {
    // Auth check — user-level client
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const { bookingId } = (await request.json()) as CreateSessionRequest;

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    // Use service role for DB operations (avoids RLS recursion on profiles)
    const db = createSupabaseServiceRole();

    // Fetch booking + slot
    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .select('id, slot_id, status, live_session_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Booking must be confirmed' }, { status: 400 });
    }

    // Check if live session already exists
    if (booking.live_session_id) {
      const { data: existing } = await db
        .from('live_sessions')
        .select('*')
        .eq('id', booking.live_session_id)
        .single();

      if (existing && existing.phase !== 'ended') {
        return NextResponse.json({ session: existing });
      }
    }

    // Generate room name and create LiveKit room
    const roomName = generateRoomName(bookingId);

    let roomSid: string | null = null;
    try {
      const room = await createRoom(roomName);
      roomSid = room.sid;
    } catch (err) {
      console.warn('LiveKit room creation failed (keys may not be set):', err);
    }

    // Insert live_session
    const { data: session, error: insertError } = await db
      .from('live_sessions')
      .insert({
        booking_id: bookingId,
        slot_id: booking.slot_id,
        room_name: roomName,
        room_sid: roomSid,
        phase: 'poczekalnia',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Link live session to booking
    await db
      .from('bookings')
      .update({ live_session_id: session.id })
      .eq('id', bookingId);

    return NextResponse.json({ session });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Create live session error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
