import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createLiveKitToken, createRoom } from '@/lib/live/livekit';
import { isStaffEmail } from '@/lib/roles';
import type { TokenRequest } from '@/lib/live/types';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = (await request.json()) as TokenRequest;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Use service role to bypass RLS (we verify access manually)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch live session with explicit FK hint
    const { data: session, error: sessionError } = await adminClient
      .from('live_sessions')
      .select('*, booking:bookings!live_sessions_booking_id_fkey(user_id)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify user is participant or staff
    const staff = isStaffEmail(user.email ?? '');
    const isBookingOwner = (session as any).booking?.user_id === user.id;

    if (!staff && !isBookingOwner) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // Fetch display name from profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    // Ensure LiveKit room exists (auto-creates if not)
    try {
      await createRoom(session.room_name);
    } catch (e) {
      // Room may already exist — that's fine
      console.log('Room create (may already exist):', (e as Error)?.message);
    }

    const token = await createLiveKitToken(
      user.id,
      session.room_name,
      staff,
      profile?.display_name ?? user.email ?? 'Uczestnik',
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
