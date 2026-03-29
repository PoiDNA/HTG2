import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/bookmarks
 *
 * Toggle bookmark. If exists, remove. If not, create.
 * Body: { post_id }
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;
  const { post_id } = await req.json();

  if (!post_id) {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  // Verify caller can access the post's group
  if (!isAdmin && !isStaff) {
    const { data: post } = await supabase
      .from('community_posts')
      .select('group_id')
      .eq('id', post_id)
      .is('deleted_at', null)
      .single();

    if (post) {
      const { data: membership } = await supabase
        .from('community_memberships')
        .select('id')
        .eq('group_id', post.group_id)
        .eq('user_id', user.id)
        .single();
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Check if already bookmarked
  const { data: existing } = await supabase
    .from('community_bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('post_id', post_id)
    .single();

  if (existing) {
    await supabase.from('community_bookmarks').delete().eq('id', existing.id);
    return NextResponse.json({ action: 'removed' });
  }

  const { error } = await supabase
    .from('community_bookmarks')
    .insert({ user_id: user.id, post_id });

  if (error) {
    if (error.code === '23505') return NextResponse.json({ action: 'already_exists' });
    return NextResponse.json({ error: 'Failed to bookmark' }, { status: 500 });
  }

  return NextResponse.json({ action: 'added' }, { status: 201 });
}

/**
 * GET /api/community/bookmarks?cursor=&limit=20
 *
 * List user's bookmarked posts.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;
  const cursor = req.nextUrl.searchParams.get('cursor');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50);

  let query = supabase
    .from('community_bookmarks')
    .select('post_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: bookmarks } = await query;
  const items = bookmarks ?? [];
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  if (items.length === 0) {
    return NextResponse.json({ items: [], next_cursor: null, has_more: false });
  }

  // Fetch full post data
  const postIds = items.map(b => b.post_id);
  const { data: posts } = await supabase
    .from('community_posts')
    .select('*')
    .in('id', postIds)
    .is('deleted_at', null);

  // Fetch author profiles
  const userIds = [...new Set((posts ?? []).map(p => p.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url, role').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const postMap = new Map((posts ?? []).map(p => [p.id, {
    ...p,
    author: p.user_id ? profileMap.get(p.user_id) ?? null : null,
  }]));

  const lastItem = items[items.length - 1];

  return NextResponse.json({
    items: items.map(b => postMap.get(b.post_id)).filter(Boolean),
    next_cursor: hasMore && lastItem ? lastItem.created_at : null,
    has_more: hasMore,
  });
}
