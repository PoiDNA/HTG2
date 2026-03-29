import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/community/groups/auto-create
 *
 * Automatically create a post-session community group when a meeting ends.
 * Called from meeting end flow or cron.
 *
 * Body: { session_id: uuid }
 *
 * Idempotent: if group already exists for this session, returns existing.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { session_id } = body;

  if (!session_id) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Check if group already exists (idempotency)
  const { data: existingGroup } = await db
    .from('community_groups')
    .select('id')
    .eq('source_session_id', session_id)
    .eq('type', 'post_session')
    .single();

  if (existingGroup) {
    return NextResponse.json({ group_id: existingGroup.id, created: false });
  }

  // Fetch meeting session with meeting info
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('id, meeting_id, scheduled_at, started_at')
    .eq('id', session_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch meeting name
  const { data: meeting } = await db
    .from('htg_meetings')
    .select('name')
    .eq('id', session.meeting_id)
    .single();

  const meetingName = meeting?.name || 'Spotkanie HTG';
  const dateStr = session.scheduled_at
    ? new Date(session.scheduled_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

  const groupName = `Po spotkaniu: ${meetingName} — ${dateStr}`;
  const slug = `po-spotkaniu-${session_id.slice(0, 8)}-${Date.now()}`;

  // Create group
  const { data: group, error: groupError } = await db
    .from('community_groups')
    .insert({
      name: groupName,
      description: `Grupa utworzona automatycznie po spotkaniu "${meetingName}".`,
      slug,
      visibility: 'private',
      type: 'post_session',
      source_session_id: session_id,
    })
    .select()
    .single();

  if (groupError) {
    console.error('Error creating post-session group:', groupError);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }

  // Fetch participants who joined the meeting
  const { data: participants } = await db
    .from('htg_meeting_participants')
    .select('user_id')
    .eq('session_id', session_id)
    .in('status', ['joined', 'approved', 'left']); // Include those who joined then left

  if (participants && participants.length > 0) {
    const memberships = participants.map(p => ({
      group_id: group.id,
      user_id: p.user_id,
      role: 'member' as const,
    }));

    await db.from('community_memberships').insert(memberships);
  }

  return NextResponse.json({ group_id: group.id, created: true }, { status: 201 });
}
