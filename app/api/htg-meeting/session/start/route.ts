import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

// POST /api/htg-meeting/session/start
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { meetingId, scheduledAt } = body;
  if (!meetingId) return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Verify meeting exists
  const { data: meeting } = await db
    .from('htg_meetings')
    .select('id')
    .eq('id', meetingId)
    .single();
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const sessionId = crypto.randomUUID();
  const roomName = `meeting-${sessionId}`;

  // Create session — creator becomes initial moderator
  const { data: session, error: sessionError } = await db
    .from('htg_meeting_sessions')
    .insert({
      id: sessionId,
      meeting_id: meetingId,
      room_name: roomName,
      status: 'waiting',
      moderator_id: user.id,
      scheduled_at: scheduledAt ?? null,
    })
    .select()
    .single();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  // Add creator as moderator participant
  await db.from('htg_meeting_participants').insert({
    session_id: sessionId,
    user_id: user.id,
    is_moderator: true,
    status: 'approved',
  });

  return NextResponse.json({ sessionId: session.id, roomName });
}
