import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';

// Temporary debug endpoint — remove after fixing
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Check env vars
  const envCheck = {
    LIVEKIT_URL: process.env.LIVEKIT_URL ? `${process.env.LIVEKIT_URL.slice(0, 30)}...` : 'NOT SET',
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ? `${process.env.LIVEKIT_API_KEY.slice(0, 10)}...` : 'NOT SET',
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ? 'SET (hidden)' : 'NOT SET',
  };

  // Check session
  let sessionData = null;
  if (sessionId) {
    const { data, error } = await admin.from('live_sessions')
      .select('id, phase, room_name, booking_id')
      .eq('id', sessionId).single();
    sessionData = { data, error: error?.message };
  }

  // Try creating token
  let tokenResult = null;
  if (sessionId && user && sessionData?.data) {
    try {
      const { createLiveKitToken, createRoom } = await import('@/lib/live/livekit');

      // Try create room
      try {
        await createRoom(sessionData.data.room_name);
        tokenResult = { roomCreated: true };
      } catch (e: any) {
        tokenResult = { roomCreated: false, roomError: e.message };
      }

      // Try create token
      const token = await createLiveKitToken(user.id, sessionData.data.room_name, true, 'Debug User');
      tokenResult = { ...tokenResult, tokenCreated: true, tokenLength: token.length };
    } catch (e: any) {
      tokenResult = { ...tokenResult, tokenError: e.message, stack: e.stack?.slice(0, 200) };
    }
  }

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    envCheck,
    session: sessionData,
    tokenResult,
    livekitUrl: process.env.LIVEKIT_URL,
  });
}
