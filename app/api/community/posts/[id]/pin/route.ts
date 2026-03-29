import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * PATCH /api/community/posts/[id]/pin
 *
 * Toggle pin status. Moderator+ only.
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
    .select('group_id, is_pinned')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Permission: moderator+ only
  if (!isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', post.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['moderator', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only moderators can pin posts' }, { status: 403 });
    }
  }

  const { data: updated, error } = await supabase
    .from('community_posts')
    .update({ is_pinned: !post.is_pinned })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to toggle pin' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
