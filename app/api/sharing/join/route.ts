import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createLiveKitToken } from '@/lib/live/livekit';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sharingId } = await request.json();
  if (!sharingId) return NextResponse.json({ error: 'sharingId required' }, { status: 400 });

  // Get sharing config (RLS will filter access)
  const { data: sharing } = await supabase
    .from('session_sharing')
    .select(`
      id, sharing_mode, is_active, live_session_id,
      live_session:live_sessions ( id, phase, room_name )
    `)
    .eq('id', sharingId)
    .eq('is_active', true)
    .single();

  if (!sharing) return NextResponse.json({ error: 'Session not found or no access' }, { status: 404 });

  const liveSession = sharing.live_session as any;
  if (!liveSession || !liveSession.room_name) {
    return NextResponse.json({ error: 'Live session not started yet' }, { status: 400 });
  }

  // Only allow joining during 'sesja' phase
  if (liveSession.phase !== 'sesja') {
    return NextResponse.json({
      error: 'Session is not in the main phase yet',
      phase: liveSession.phase,
    }, { status: 400 });
  }

  // Generate listen-only token (canPublish: false)
  const { data: profile } = await supabase.from('profiles').select('display_name, email').eq('id', user.id).single();
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'Słuchacz';

  const token = await createLiveKitToken(
    user.id,
    liveSession.room_name,
    false, // NOT staff — listen-only
    displayName,
  );

  // Record listener
  await supabase.from('session_listeners').upsert({
    session_sharing_id: sharingId,
    live_session_id: liveSession.id,
    user_id: user.id,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'session_sharing_id,user_id' });

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    roomName: liveSession.room_name,
    phase: liveSession.phase,
    listenOnly: true,
  });
}
