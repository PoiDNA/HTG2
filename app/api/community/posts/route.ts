import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth, requireGroupAccess } from '@/lib/community/auth';
import { checkCommunityRateLimit, logCommunityAction } from '@/lib/community/rate-limit';
import { createMentionNotifications } from '@/lib/community/notifications';
import type { TipTapContent } from '@/lib/community/types';

/**
 * GET /api/community/posts?group_id=&cursor=&limit=20
 *
 * Fetch feed for a group with cursor-based pagination.
 * Cursor is based on (is_pinned, last_activity_at, id) for bump-ordering.
 * Pinned posts always appear first.
 */
export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get('group_id');
  const cursor = req.nextUrl.searchParams.get('cursor');
  const search = req.nextUrl.searchParams.get('search');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50);

  if (!groupId) {
    return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
  }

  const auth = await requireGroupAccess(groupId);
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Build query — pinned posts first, then by last_activity_at DESC
  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('last_activity_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // fetch one extra to determine has_more

  // Full-text search on content_text
  if (search) {
    query = query.ilike('content_text', `%${search}%`);
  }

  // Cursor pagination: decode cursor as last_activity_at|id
  if (cursor) {
    const [cursorTime, cursorId] = cursor.split('|');
    if (cursorTime && cursorId) {
      // Fetch posts older than cursor (non-pinned, since pinned are always on top)
      query = query
        .eq('is_pinned', false)
        .or(`last_activity_at.lt.${cursorTime},and(last_activity_at.eq.${cursorTime},id.lt.${cursorId})`);
    }
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }

  const items = posts ?? [];
  const hasMore = items.length > limit;
  if (hasMore) items.pop(); // remove the extra item

  // Fetch author profiles
  const userIds = [...new Set(items.map(p => p.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url, role').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Check which posts the current user has reacted to
  const postIds = items.map(p => p.id);
  const { data: userReactions } = postIds.length > 0
    ? await supabase
        .from('community_reactions')
        .select('target_id')
        .eq('user_id', user.id)
        .eq('target_type', 'post')
        .in('target_id', postIds)
    : { data: [] };
  const reactedPostIds = new Set((userReactions ?? []).map(r => r.target_id));

  // Build next cursor
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.last_activity_at}|${lastItem.id}`
    : null;

  const result = {
    items: items.map(post => ({
      ...post,
      author: post.user_id ? profileMap.get(post.user_id) ?? null : null,
      user_has_reacted: reactedPostIds.has(post.id),
    })),
    next_cursor: nextCursor,
    has_more: hasMore,
  };

  return NextResponse.json(result);
}

/**
 * POST /api/community/posts
 *
 * Create a new post. Requires group membership.
 * Body: { group_id, content: TipTapJSON, attachments?: Attachment[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { group_id, content, attachments } = body;

  if (!group_id || !content) {
    return NextResponse.json({ error: 'group_id and content are required' }, { status: 400 });
  }

  const auth = await requireGroupAccess(group_id, { requireWrite: true });
  if ('error' in auth) return auth.error;

  // Rate limit check
  const rateLimited = await checkCommunityRateLimit(auth.user.id, 'post');
  if (rateLimited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Max 10 posts per hour.' }, { status: 429 });
  }

  // Extract plain text from TipTap content for search
  const contentText = extractPlainText(content);

  // Extract mentioned user IDs and mention types from TipTap mention nodes
  const mentionedUserIds = extractMentionIds(content);
  const mentionTypes = extractMentionTypes(content);

  const { data: post, error } = await auth.supabase
    .from('community_posts')
    .insert({
      group_id,
      user_id: auth.user.id,
      content,
      content_text: contentText,
      attachments: attachments ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }

  // Log rate limit action
  await logCommunityAction(auth.user.id, 'post');

  // Create mention notifications (async, don't block response)
  if (mentionedUserIds.length > 0 || mentionTypes.length > 0) {
    // Save mentions
    const mentionInserts = mentionedUserIds.map(uid => ({
      post_id: post.id,
      mentioned_user_id: uid,
    }));
    if (mentionInserts.length > 0) {
      await auth.supabase.from('community_mentions').insert(mentionInserts);
    }

    // Create notifications (supports @all, @staff)
    await createMentionNotifications({
      mentionedUserIds,
      mentionTypes,
      actorId: auth.user.id,
      targetType: 'post',
      targetId: post.id,
      groupId: group_id,
    });
  }

  return NextResponse.json(post, { status: 201 });
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Extract plain text from TipTap JSON content.
 */
function extractPlainText(content: TipTapContent): string {
  const texts: string[] = [];

  function walk(nodes: TipTapContent['content']) {
    for (const node of nodes) {
      if (node.text) texts.push(node.text);
      if (node.content) walk(node.content);
      // Extract mention display text
      if (node.type === 'mention' && node.attrs?.label) {
        texts.push(`@${node.attrs.label}`);
      }
    }
  }

  if (content?.content) walk(content.content);
  return texts.join(' ').trim();
}

/**
 * Extract user IDs from TipTap mention nodes.
 * Mention nodes have: { type: 'mention', attrs: { id: 'uuid', label: 'display_name' } }
 */
function extractMentionIds(content: TipTapContent): string[] {
  const ids: string[] = [];

  function walk(nodes: TipTapContent['content']) {
    for (const node of nodes) {
      if (node.type === 'mention' && node.attrs?.id && node.attrs.id !== 'all' && node.attrs.id !== 'staff') {
        ids.push(node.attrs.id as string);
      }
      if (node.content) walk(node.content);
    }
  }

  if (content?.content) walk(content.content);
  return [...new Set(ids)];
}

/**
 * Extract special mention types (@all, @staff) from TipTap content.
 */
function extractMentionTypes(content: TipTapContent): Array<'all' | 'staff'> {
  const types: Array<'all' | 'staff'> = [];

  function walk(nodes: TipTapContent['content']) {
    for (const node of nodes) {
      if (node.type === 'mention') {
        if (node.attrs?.id === 'all') types.push('all');
        if (node.attrs?.id === 'staff') types.push('staff');
      }
      if (node.content) walk(node.content);
    }
  }

  if (content?.content) walk(content.content);
  return [...new Set(types)];
}
