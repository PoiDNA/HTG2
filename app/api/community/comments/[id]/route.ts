import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth, isCommunityModerator } from '@/lib/community/auth';

/**
 * PATCH /api/community/comments/[id]
 *
 * Edit a comment. Author only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { data: comment } = await supabase
    .from('community_comments')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  if (comment.user_id !== user.id) {
    return NextResponse.json({ error: 'Only the author can edit' }, { status: 403 });
  }

  const body = await req.json();
  const { content, attachments } = body;

  const updates: Record<string, unknown> = {
    is_edited: true,
    updated_at: new Date().toISOString(),
  };
  if (content !== undefined) updates.content = content;
  if (attachments !== undefined) updates.attachments = attachments;

  const { data: updated, error } = await supabase
    .from('community_comments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/community/comments/[id]
 *
 * Soft-delete a comment. Author, moderator+, or admin.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  const { data: comment } = await supabase
    .from('community_comments')
    .select('user_id, group_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const isAuthor = comment.user_id === user.id;
  if (!isAuthor && !isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', comment.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !isCommunityModerator(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from('community_comments')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
