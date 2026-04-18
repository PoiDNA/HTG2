import { NextRequest, NextResponse } from 'next/server';
import { requirePytaniaAuth, forbiddenForPoSesji } from '@/lib/pytania/auth';

/**
 * POST /api/pytania/[id]/like — toggle like (add or remove)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase, user } = auth;

  // Check question exists
  const { data: question, error: qErr } = await supabase
    .from('session_questions')
    .select('id')
    .eq('id', id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check existing like
  const { data: existing } = await supabase
    .from('session_question_likes')
    .select('question_id')
    .eq('question_id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('session_question_likes')
      .delete()
      .eq('question_id', id)
      .eq('user_id', user.id);
    return NextResponse.json({ action: 'removed' });
  }

  const { error } = await supabase
    .from('session_question_likes')
    .insert({ question_id: id, user_id: user.id });

  if (error) {
    if (error.code === '23505') return NextResponse.json({ action: 'already_exists' });
    console.error('POST /api/pytania/[id]/like error:', error);
    return NextResponse.json({ error: 'Failed to like question' }, { status: 500 });
  }

  return NextResponse.json({ action: 'added' }, { status: 201 });
}
