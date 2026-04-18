import { NextRequest, NextResponse } from 'next/server';
import { requirePytaniaAuth, forbiddenForPoSesji } from '@/lib/pytania/auth';

/**
 * GET /api/pytania/[id]
 * Returns question with likes_count, comments_count, answer fragment, author.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase } = auth;

  const { data: question, error } = await supabase
    .from('session_questions_ranked')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !question) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [{ data: profile }, { data: userLike }, { data: fragment }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').eq('id', question.author_id).single(),
    supabase
      .from('session_question_likes')
      .select('question_id')
      .eq('question_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    question.answer_fragment_id
      ? supabase
          .from('session_fragments')
          .select('id, title, title_i18n, start_sec, end_sec, session_template_id')
          .eq('id', question.answer_fragment_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    ...question,
    author: profile ?? null,
    user_has_liked: !!userLike,
    answer_fragment: fragment ?? null,
  });
}

/**
 * PATCH /api/pytania/[id]
 * Admin only: change status + optional answer_fragment_id.
 * Body: { status: 'rozpoznane', answer_fragment_id?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { status, answer_fragment_id } = body ?? {};

  if (status && !['oczekujace', 'rozpoznane'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;

  if (status === 'rozpoznane') {
    updates.resolved_by = auth.user.id;
    updates.resolved_at = new Date().toISOString();
    if (answer_fragment_id) updates.answer_fragment_id = answer_fragment_id;
  }

  if (status === 'oczekujace') {
    updates.resolved_by = null;
    updates.resolved_at = null;
    updates.answer_fragment_id = null;
  }

  const { data, error } = await auth.supabase
    .from('session_questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /api/pytania/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/pytania/[id]
 * Author (only oczekujace) or admin.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase } = auth;

  const { data: question, error: fetchError } = await supabase
    .from('session_questions')
    .select('id, author_id, status')
    .eq('id', id)
    .single();

  if (fetchError || !question) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const canDelete =
    auth.isAdmin ||
    (question.author_id === auth.user.id && question.status === 'oczekujace');

  if (!canDelete) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('session_questions').delete().eq('id', id);

  if (error) {
    console.error('DELETE /api/pytania/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
