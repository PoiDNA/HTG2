import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';

async function checkAccess() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) return null;
  return user;
}

interface QuestionInput {
  id?: string;
  question_text: string;
  order_index: number;
}

interface StageInput {
  id?: string;
  name: string;
  order_index: number;
  questions: QuestionInput[];
}

// POST /api/htg-meeting/[id]/stages — full replace of stages + questions
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: meetingId } = await params;
  const body = await req.json();
  const stages: StageInput[] = body.stages ?? [];

  const db = createSupabaseServiceRole();

  // Verify meeting exists
  const { data: meeting } = await db
    .from('htg_meetings')
    .select('id')
    .eq('id', meetingId)
    .single();
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  // Delete existing stages (cascades to questions)
  const { error: deleteError } = await db
    .from('htg_meeting_stages')
    .delete()
    .eq('meeting_id', meetingId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Insert new stages
  const result = [];
  for (const stage of stages) {
    const { data: newStage, error: stageError } = await db
      .from('htg_meeting_stages')
      .insert({
        meeting_id: meetingId,
        name: stage.name,
        order_index: stage.order_index,
      })
      .select()
      .single();

    if (stageError) return NextResponse.json({ error: stageError.message }, { status: 500 });

    const questions = [];
    for (const q of stage.questions ?? []) {
      const { data: newQ, error: qError } = await db
        .from('htg_meeting_questions')
        .insert({
          stage_id: newStage.id,
          question_text: q.question_text,
          order_index: q.order_index,
        })
        .select()
        .single();

      if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });
      questions.push(newQ);
    }

    result.push({ ...newStage, questions });
  }

  return NextResponse.json({ stages: result });
}
