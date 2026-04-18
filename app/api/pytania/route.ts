import { NextRequest, NextResponse } from 'next/server';
import { requirePytaniaAuth, forbiddenForPoSesji } from '@/lib/pytania/auth';

const SORT_OPTIONS = ['likes', 'comments', 'new'] as const;
type Sort = typeof SORT_OPTIONS[number];

/**
 * GET /api/pytania?sort=likes|comments|new&status=oczekujace|rozpoznane&limit=20&offset=0
 */
export async function GET(req: NextRequest) {
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const { supabase } = auth;
  const params = req.nextUrl.searchParams;

  const sort = (SORT_OPTIONS.includes(params.get('sort') as Sort) ? params.get('sort') : 'new') as Sort;
  const status = params.get('status');
  const limit = Math.min(parseInt(params.get('limit') || '20'), 50);
  const offset = Math.max(parseInt(params.get('offset') || '0'), 0);

  let query = supabase
    .from('session_questions_ranked')
    .select('*')
    .range(offset, offset + limit - 1);

  if (status === 'oczekujace' || status === 'rozpoznane') {
    query = query.eq('status', status);
  }

  if (sort === 'likes') {
    query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
  } else if (sort === 'comments') {
    query = query.order('comments_count', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error('GET /api/pytania error:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }

  // Enrich with author profiles
  const authorIds = [...new Set((data ?? []).map(q => q.author_id).filter(Boolean))];
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Check which questions current user has liked
  const questionIds = (data ?? []).map(q => q.id);
  const { data: userLikes } = questionIds.length > 0
    ? await supabase
        .from('session_question_likes')
        .select('question_id')
        .eq('user_id', auth.user.id)
        .in('question_id', questionIds)
    : { data: [] };
  const likedSet = new Set((userLikes ?? []).map(l => l.question_id));

  // Fetch fragments for resolved questions
  const fragmentIds = [...new Set(
    (data ?? [])
      .filter(q => q.status === 'rozpoznane' && q.answer_fragment_id)
      .map(q => q.answer_fragment_id as string)
  )];
  const { data: fragments } = fragmentIds.length > 0
    ? await supabase
        .from('session_fragments')
        .select('id, title, start_sec, end_sec, session_template_id, session_templates(title)')
        .in('id', fragmentIds)
    : { data: [] };
  const fragmentMap = new Map((fragments ?? []).map(f => {
    const sessionTitle = Array.isArray(f.session_templates)
      ? (f.session_templates[0] as { title: string } | undefined)?.title ?? ''
      : (f.session_templates as { title: string } | null)?.title ?? '';
    return [f.id, { id: f.id, title: f.title, start_sec: f.start_sec, end_sec: f.end_sec, session_template_id: f.session_template_id, session_title: sessionTitle }];
  }));

  const items = (data ?? []).map(q => ({
    ...q,
    author: profileMap.get(q.author_id) ?? null,
    user_has_liked: likedSet.has(q.id),
    answer_fragment: q.answer_fragment_id ? (fragmentMap.get(q.answer_fragment_id) ?? null) : null,
  }));

  return NextResponse.json({ items, total: items.length });
}

/**
 * POST /api/pytania
 * Body: { title: string, body?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) return forbiddenForPoSesji();

  const body = await req.json();
  const { title, body: questionBody } = body ?? {};

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return NextResponse.json({ error: 'title jest wymagany (min 3 znaki)' }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'title max 200 znaków' }, { status: 400 });
  }
  if (questionBody && typeof questionBody === 'string' && questionBody.length > 5000) {
    return NextResponse.json({ error: 'body max 5000 znaków' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('session_questions')
    .insert({
      author_id: auth.user.id,
      title: title.trim(),
      body: questionBody?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/pytania error:', error);
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
