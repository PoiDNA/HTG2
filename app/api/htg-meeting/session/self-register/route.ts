import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/htg-meeting/session/self-register
// Body: { sessionId }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Fetch session + meeting info
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('id, status, meeting_id, htg_meetings!inner(allow_self_register, max_participants, participant_selection)')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status !== 'waiting') return NextResponse.json({ error: 'Session is not open for registration' }, { status: 400 });

  const meeting = (session as any).htg_meetings;
  if (!meeting.allow_self_register) return NextResponse.json({ error: 'Self-registration not allowed for this meeting' }, { status: 403 });

  // Check participant count
  const { count } = await db
    .from('htg_meeting_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if ((count ?? 0) >= meeting.max_participants) {
    return NextResponse.json({ error: 'Meeting is full' }, { status: 409 });
  }

  // Check if already registered
  const { data: existing } = await db
    .from('htg_meeting_participants')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ alreadyRegistered: true, status: existing.status });
  }

  // For lottery mode → status 'registered' (admin approves later)
  // For admin mode → status 'registered' too
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single();

  await db.from('htg_meeting_participants').insert({
    session_id: sessionId,
    user_id: user.id,
    is_moderator: false,
    status: 'registered',
    display_name: profile?.display_name ?? null,
    email: profile?.email ?? user.email ?? null,
  });

  return NextResponse.json({ registered: true });
}

// DELETE /api/htg-meeting/session/self-register
// Body: { sessionId } — cancel registration
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  await db
    .from('htg_meeting_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'registered'); // can only cancel if not yet approved/joined

  return NextResponse.json({ cancelled: true });
}
