import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// GET /api/htg-meeting/session/my-active
// Returns active sessions where the current user is an approved/joined participant
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ sessions: [] });

  const db = createSupabaseServiceRole();

  const { data: participations } = await db
    .from('htg_meeting_participants')
    .select(`
      session_id, status, is_moderator,
      htg_meeting_sessions!inner (
        id, status, room_name,
        htg_meetings!inner ( name )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['approved', 'joined'])
    .in('htg_meeting_sessions.status', ['active', 'free_talk', 'waiting']);

  const sessions = (participations ?? []).map((p: any) => ({
    sessionId: p.session_id,
    sessionStatus: p.htg_meeting_sessions.status,
    meetingName: p.htg_meeting_sessions.htg_meetings?.name ?? 'Spotkanie HTG',
    isModerator: p.is_moderator,
  }));

  return NextResponse.json({ sessions });
}
