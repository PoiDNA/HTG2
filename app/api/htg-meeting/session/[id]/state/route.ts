import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// GET /api/htg-meeting/session/[id]/state
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data: session, error } = await db
    .from('htg_meeting_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Load current stage
  let currentStage = null;
  if (session.current_stage_id) {
    const { data: stage } = await db
      .from('htg_meeting_stages')
      .select('id, name, order_index')
      .eq('id', session.current_stage_id)
      .single();
    currentStage = stage;
  }

  // Load current question
  let currentQuestion = null;
  if (session.current_question_id) {
    const { data: question } = await db
      .from('htg_meeting_questions')
      .select('id, question_text')
      .eq('id', session.current_question_id)
      .single();
    currentQuestion = question;
  }

  // Load participants
  const { data: participants } = await db
    .from('htg_meeting_participants')
    .select('user_id, display_name, is_moderator, hand_raised, is_muted, status')
    .eq('session_id', sessionId)
    .neq('status', 'left');

  return NextResponse.json({
    status: session.status,
    moderatorId: session.moderator_id,
    currentSpeakerId: session.current_speaker_id,
    currentStage,
    currentQuestion,
    allMuted: session.all_muted ?? false,
    participants: (participants ?? []).map(p => ({
      userId: p.user_id,
      displayName: p.display_name ?? 'Uczestnik',
      isModerator: p.is_moderator ?? false,
      handRaised: p.hand_raised ?? false,
      isMuted: p.is_muted ?? false,
      status: p.status,
    })),
  });
}
