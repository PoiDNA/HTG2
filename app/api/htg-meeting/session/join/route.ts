import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { createLiveKitToken } from '@/lib/live/livekit';

// POST /api/htg-meeting/session/join
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { sessionId } = body;
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Load session
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status === 'ended') return NextResponse.json({ error: 'Session ended' }, { status: 400 });

  const isAdmin = isAdminEmail(user.email ?? '');

  // Load participant record
  let participant = null;
  const { data: p } = await db
    .from('htg_meeting_participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  participant = p;

  // Non-admin must be in participants list
  if (!isAdmin && !participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Get display name from profiles
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = participant?.display_name
    ?? profile?.display_name
    ?? profile?.email
    ?? user.email
    ?? 'Uczestnik';

  // If admin but not in participants, add them
  if (isAdmin && !participant) {
    const { data: newP } = await db
      .from('htg_meeting_participants')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        display_name: displayName,
        email: user.email,
        is_moderator: session.moderator_id === user.id,
        status: 'joined',
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();
    participant = newP;
  } else if (participant) {
    // Update display name and status
    await db
      .from('htg_meeting_participants')
      .update({
        display_name: displayName,
        status: 'joined',
        joined_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('user_id', user.id);
  }

  const isModerator = participant?.is_moderator ?? (session.moderator_id === user.id);

  // Create LiveKit token with identity format: userId:displayName
  const identity = `${user.id}:${displayName}`;
  const token = await createLiveKitToken(identity, session.room_name, isModerator, displayName);

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    isModerator,
  });
}
