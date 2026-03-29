import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * PATCH /api/community/posts/[id]
 *
 * Edit a post. Author or moderator+ can edit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  // Fetch post
  const { data: post } = await supabase
    .from('community_posts')
    .select('user_id, group_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Permission: author or moderator+
  const isAuthor = post.user_id === user.id;
  if (!isAuthor && !isAdmin && !isStaff) {
    // Check if user is group moderator
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', post.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['moderator', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await req.json();
  const { content, attachments } = body;

  const updates: Record<string, unknown> = {
    is_edited: true,
    updated_at: new Date().toISOString(),
  };

  if (content !== undefined) {
    updates.content = content;
    // Re-extract plain text
    updates.content_text = extractPlainText(content);
  }
  if (attachments !== undefined) {
    updates.attachments = attachments;
  }

  const { data: updated, error } = await supabase
    .from('community_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/community/posts/[id]
 *
 * Soft-delete a post. Author, moderator+, or admin.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  // Fetch post
  const { data: post } = await supabase
    .from('community_posts')
    .select('user_id, group_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Permission check
  const isAuthor = post.user_id === user.id;
  if (!isAuthor && !isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', post.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['moderator', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Soft delete
  const { error } = await supabase
    .from('community_posts')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ─── Helper ───────────────────────────────────────────────────

function extractPlainText(content: { content?: Array<{ text?: string; content?: unknown[]; type?: string; attrs?: Record<string, unknown> }> }): string {
  const texts: string[] = [];
  function walk(nodes: typeof content.content) {
    for (const node of nodes ?? []) {
      if (node.text) texts.push(node.text);
      if (node.content) walk(node.content as typeof nodes);
      if (node.type === 'mention' && node.attrs?.label) texts.push(`@${node.attrs.label}`);
    }
  }
  if (content?.content) walk(content.content);
  return texts.join(' ').trim();
}
