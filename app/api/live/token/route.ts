import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createLiveKitToken } from '@/lib/live/livekit';
import { isStaffEmail } from '@/lib/roles';
import type { TokenRequest } from '@/lib/live/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = (await request.json()) as TokenRequest;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Fetch live session
    const { data: session, error: sessionError } = await supabase
      .from('live_sessions')
      .select('*, bookings!inner(user_id)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify user is participant or staff
    const staff = isStaffEmail(user.email ?? '');
    const isBookingOwner = session.bookings?.user_id === user.id;

    if (!staff && !isBookingOwner) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // Fetch display name from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const token = await createLiveKitToken(
      user.id,
      session.room_name,
      staff,
      profile?.full_name ?? user.email ?? 'Uczestnik',
    );

    return NextResponse.json({
      token,
      url: process.env.LIVEKIT_URL ?? '',
      roomName: session.room_name,
      isStaff: staff,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('LiveKit token error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
