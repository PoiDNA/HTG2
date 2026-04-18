import { NextRequest, NextResponse } from 'next/server';
import { requirePytaniaAuth, forbiddenForPoSesji } from '@/lib/pytania/auth';

/**
 * GET /api/pytania/[id]/komentarze?limit=50&offset=0
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase } = auth;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get('offset') || '0'), 0);

  const { data: comments, error } = await supabase
    .from('session_question_comments')
    .select('*')
    .eq('question_id', id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('GET /api/pytania/[id]/komentarze error:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  // Enrich with author profiles
  const authorIds = [...new Set((comments ?? []).map(c => c.author_id))];
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  return NextResponse.json(
    (comments ?? []).map(c => ({ ...c, author: profileMap.get(c.author_id) ?? null }))
  );
}

/**
 * POST /api/pytania/[id]/komentarze
 * Body: { body: string }
 * Blocked when question status = 'rozpoznane' (enforced by RLS + double-check here).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const body = await req.json();
  const { body: commentBody } = body ?? {};

  if (!commentBody || typeof commentBody !== 'string' || commentBody.trim().length < 1) {
    return NextResponse.json({ error: 'body jest wymagany' }, { status: 400 });
  }
  if (commentBody.length > 3000) {
    return NextResponse.json({ error: 'body max 3000 znaków' }, { status: 400 });
  }

  const { supabase, user } = auth;

  // Block comment if question is already resolved
  const { data: question, error: qErr } = await supabase
    .from('session_questions')
    .select('id, status')
    .eq('id', id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: 'Pytanie nie istnieje' }, { status: 404 });
  }

  if (question.status === 'rozpoznane') {
    return NextResponse.json(
      { error: 'Komentowanie zablokowane — pytanie zostało już rozpoznane' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('session_question_comments')
    .insert({
      question_id: id,
      author_id: user.id,
      body: commentBody.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/pytania/[id]/komentarze error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }

  // Enrich with author profile for immediate use in UI
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ ...data, author: profile ?? null }, { status: 201 });
}

/**
 * DELETE /api/pytania/[id]/komentarze?comment_id=uuid
 * Author or admin can delete.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const commentId = req.nextUrl.searchParams.get('comment_id');
  if (!commentId) {
    return NextResponse.json({ error: 'comment_id is required' }, { status: 400 });
  }

  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase, user } = auth;

  const { data: comment, error: fetchError } = await supabase
    .from('session_question_comments')
    .select('id, author_id')
    .eq('id', commentId)
    .single();

  if (fetchError || !comment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!auth.isAdmin && comment.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('session_question_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('DELETE /api/pytania/[id]/komentarze error:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
