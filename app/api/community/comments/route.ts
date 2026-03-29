import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAccess, requireCommunityAuth } from '@/lib/community/auth';
import { checkCommunityRateLimit, logCommunityAction } from '@/lib/community/rate-limit';
import { notifyPostAuthor, createMentionNotifications } from '@/lib/community/notifications';
import type { TipTapContent } from '@/lib/community/types';

/**
 * GET /api/community/comments?post_id=&cursor=&limit=20
 *
 * Fetch comments for a post with cursor-based pagination.
 */
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post_id');
  const cursor = req.nextUrl.searchParams.get('cursor');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50);

  if (!postId) {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Verify post exists and get group_id for access check
  const { data: post } = await supabase
    .from('community_posts')
    .select('group_id')
    .eq('id', postId)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Access check
  const groupAuth = await requireGroupAccess(post.group_id);
  if ('error' in groupAuth) return groupAuth.error;

  const parentId = req.nextUrl.searchParams.get('parent_id');
  const includeReplies = req.nextUrl.searchParams.get('include_replies') === 'true';

  let query = supabase
    .from('community_comments')
    .select('*')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit + 1);

  // include_replies=true: fetch ALL comments (top-level + replies) for client-side grouping
  // parent_id: fetch replies to a specific comment
  // default: fetch top-level only
  if (!includeReplies) {
    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }
  }

  if (cursor) {
    query = query.gt('created_at', cursor);
  }

  const { data: comments, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  const items = comments ?? [];
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  // Fetch author profiles
  const userIds = [...new Set(items.map(c => c.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url, role').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.created_at : null;

  return NextResponse.json({
    items: items.map(comment => ({
      ...comment,
      author: comment.user_id ? profileMap.get(comment.user_id) ?? null : null,
    })),
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}

/**
 * POST /api/community/comments
 *
 * Create a new comment. Requires group membership.
 * Body: { post_id, content: TipTapJSON, attachments?: Attachment[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { post_id, content, attachments, parent_id } = body;

  if (!post_id || !content) {
    return NextResponse.json({ error: 'post_id and content are required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Fetch post to get group_id
  const { data: post } = await supabase
    .from('community_posts')
    .select('group_id, user_id')
    .eq('id', post_id)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Group access check
  const groupAuth = await requireGroupAccess(post.group_id, { requireWrite: true });
  if ('error' in groupAuth) return groupAuth.error;

  // Rate limit
  const rateLimited = await checkCommunityRateLimit(user.id, 'comment');
  if (rateLimited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Max 30 comments per hour.' }, { status: 429 });
  }

  const contentText = extractPlainText(content);
  const mentionedUserIds = extractMentionIds(content);

  const { data: comment, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: post_id,
      group_id: post.group_id,
      user_id: user.id,
      parent_id: parent_id || null,
      content,
      content_text: contentText,
      attachments: attachments ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }

  await logCommunityAction(user.id, 'comment');

  // Notify post author (if different from commenter)
  if (post.user_id && post.user_id !== user.id) {
    await notifyPostAuthor({
      postAuthorId: post.user_id,
      commenterId: user.id,
      postId: post_id,
      groupId: post.group_id,
    });
  }

  // Notify thread subscribers (users who previously commented on this post)
  // The auto-subscribe trigger (028 migration) handles subscribing the current commenter
  const { data: subscribers } = await supabase
    .from('community_thread_subscriptions')
    .select('user_id')
    .eq('post_id', post_id)
    .neq('user_id', user.id); // Don't notify self

  const subscriberIds = (subscribers ?? []).map(s => s.user_id);
  // Exclude the post author (already notified above) and mentioned users (notified below)
  const extraSubscribers = subscriberIds.filter(
    id => id !== post.user_id && !mentionedUserIds.includes(id)
  );

  if (extraSubscribers.length > 0) {
    const threadNotifications = extraSubscribers.map(uid => ({
      user_id: uid,
      actor_id: user.id,
      type: 'comment' as const,
      target_type: 'post' as const,
      target_id: post_id,
      group_id: post.group_id,
    }));
    await supabase.from('community_notifications').insert(threadNotifications);
  }

  // Handle mentions
  if (mentionedUserIds.length > 0) {
    const mentionInserts = mentionedUserIds.map(uid => ({
      comment_id: comment.id,
      mentioned_user_id: uid,
    }));
    await supabase.from('community_mentions').insert(mentionInserts);

    await createMentionNotifications({
      mentionedUserIds,
      actorId: user.id,
      targetType: 'comment',
      targetId: comment.id,
      groupId: post.group_id,
    });
  }

  return NextResponse.json(comment, { status: 201 });
}

// ─── Helpers ──────────────────────────────────────────────────

function extractPlainText(content: TipTapContent): string {
  const texts: string[] = [];
  function walk(nodes: TipTapContent['content']) {
    for (const node of nodes) {
      if (node.text) texts.push(node.text);
      if (node.content) walk(node.content as TipTapContent['content']);
      if (node.type === 'mention' && node.attrs?.label) texts.push(`@${node.attrs.label}`);
    }
  }
  if (content?.content) walk(content.content);
  return texts.join(' ').trim();
}

function extractMentionIds(content: TipTapContent): string[] {
  const ids: string[] = [];
  function walk(nodes: TipTapContent['content']) {
    for (const node of nodes) {
      if (node.type === 'mention' && node.attrs?.id) ids.push(node.attrs.id as string);
      if (node.content) walk(node.content as TipTapContent['content']);
    }
  }
  if (content?.content) walk(content.content);
  return [...new Set(ids)];
}
