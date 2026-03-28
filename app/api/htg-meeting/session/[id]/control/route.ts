import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

function pickRandom<T>(arr: T[], exclude?: T): T | null {
  const pool = exclude !== undefined ? arr.filter(x => x !== exclude) : arr;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// POST /api/htg-meeting/session/[id]/control
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Only moderator or admin can control
  const isAdmin = isAdminEmail(user.email ?? '');
  if (!isAdmin && session.moderator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { action, payload } = body;

  // Helper: get joined participants (excluding moderator for speaker selection)
  async function getJoinedParticipants(excludeModerator = false) {
    let query = db
      .from('htg_meeting_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('status', 'joined');
    if (excludeModerator) {
      query = query.eq('is_moderator', false);
    }
    const { data } = await query;
    return (data ?? []).map(p => p.user_id);
  }

  // Helper: get all stages for this meeting ordered by order_index
  async function getStages() {
    const { data } = await db
      .from('htg_meeting_stages')
      .select('id, order_index')
      .eq('meeting_id', session.meeting_id)
      .order('order_index');
    return data ?? [];
  }

  // Helper: get questions for a stage ordered by order_index
  async function getQuestionsForStage(stageId: string) {
    const { data } = await db
      .from('htg_meeting_questions')
      .select('id, order_index')
      .eq('stage_id', stageId)
      .order('order_index');
    return data ?? [];
  }

  switch (action) {
    case 'start': {
      const stages = await getStages();
      const firstStage = stages[0] ?? null;
      let firstQuestion = null;
      if (firstStage) {
        const questions = await getQuestionsForStage(firstStage.id);
        firstQuestion = questions[0] ?? null;
      }

      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants);

      await db.from('htg_meeting_sessions').update({
        status: 'active',
        started_at: new Date().toISOString(),
        current_stage_id: firstStage?.id ?? null,
        current_question_id: firstQuestion?.id ?? null,
        current_speaker_id: speaker,
      }).eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    case 'next_question': {
      if (!session.current_stage_id) return NextResponse.json({ error: 'No current stage' }, { status: 400 });

      const questions = await getQuestionsForStage(session.current_stage_id);
      const currentIdx = questions.findIndex(q => q.id === session.current_question_id);
      const nextQuestion = currentIdx >= 0 && currentIdx + 1 < questions.length
        ? questions[currentIdx + 1]
        : null;

      if (!nextQuestion) {
        // No more questions → advance to next stage
        const stages = await getStages();
        const currentStageIdx = stages.findIndex(s => s.id === session.current_stage_id);
        const nextStage = currentStageIdx >= 0 && currentStageIdx + 1 < stages.length
          ? stages[currentStageIdx + 1]
          : null;

        if (!nextStage) {
          // No more stages → free talk
          await db.from('htg_meeting_sessions').update({
            status: 'free_talk',
            current_stage_id: null,
            current_question_id: null,
            current_speaker_id: null,
          }).eq('id', sessionId);
          return NextResponse.json({ ok: true });
        }

        const nextStageQuestions = await getQuestionsForStage(nextStage.id);
        const firstQ = nextStageQuestions[0] ?? null;
        const participants = await getJoinedParticipants(true);
        const speaker = pickRandom(participants, session.current_speaker_id);

        await db.from('htg_meeting_sessions').update({
          current_stage_id: nextStage.id,
          current_question_id: firstQ?.id ?? null,
          current_speaker_id: speaker,
        }).eq('id', sessionId);

        return NextResponse.json({ ok: true });
      }

      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);

      await db.from('htg_meeting_sessions').update({
        current_question_id: nextQuestion.id,
        current_speaker_id: speaker,
      }).eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    case 'next_stage': {
      const stages = await getStages();
      const currentStageIdx = stages.findIndex(s => s.id === session.current_stage_id);
      const nextStage = currentStageIdx >= 0 && currentStageIdx + 1 < stages.length
        ? stages[currentStageIdx + 1]
        : null;

      if (!nextStage) {
        // No more stages → free talk
        await db.from('htg_meeting_sessions').update({
          status: 'free_talk',
          current_stage_id: null,
          current_question_id: null,
          current_speaker_id: null,
        }).eq('id', sessionId);
        return NextResponse.json({ ok: true });
      }

      const questions = await getQuestionsForStage(nextStage.id);
      const firstQ = questions[0] ?? null;
      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);

      await db.from('htg_meeting_sessions').update({
        current_stage_id: nextStage.id,
        current_question_id: firstQ?.id ?? null,
        current_speaker_id: speaker,
      }).eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    case 'free_talk': {
      const newStatus = session.status === 'free_talk' ? 'active' : 'free_talk';
      await db.from('htg_meeting_sessions').update({ status: newStatus }).eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'skip_speaker': {
      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);
      await db.from('htg_meeting_sessions').update({ current_speaker_id: speaker }).eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'mute_all': {
      const newMuted = !(session.all_muted ?? false);
      await db.from('htg_meeting_sessions').update({ all_muted: newMuted }).eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'mute_participant': {
      const { userId } = payload ?? {};
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

      const { data: p } = await db
        .from('htg_meeting_participants')
        .select('is_muted')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!p) return NextResponse.json({ error: 'Participant not found' }, { status: 404 });

      await db.from('htg_meeting_participants')
        .update({ is_muted: !p.is_muted })
        .eq('session_id', sessionId)
        .eq('user_id', userId);

      return NextResponse.json({ ok: true });
    }

    case 'end': {
      await db.from('htg_meeting_sessions').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      }).eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
