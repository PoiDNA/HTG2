import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/thread-subscriptions
 *
 * Subscribe to a post thread (get notified on new comments).
 * Body: { post_id }
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { post_id } = await req.json();
  if (!post_id) {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  // Verify caller can access the post's group
  if (!auth.isAdmin && !auth.isStaff) {
    const { data: post } = await auth.supabase
      .from('community_posts')
      .select('group_id')
      .eq('id', post_id)
      .is('deleted_at', null)
      .single();

    if (post) {
      const { data: membership } = await auth.supabase
        .from('community_memberships')
        .select('id')
        .eq('group_id', post.group_id)
        .eq('user_id', auth.user.id)
        .single();
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const { error } = await auth.supabase
    .from('community_thread_subscriptions')
    .upsert({
      user_id: auth.user.id,
      post_id,
    }, {
      onConflict: 'user_id,post_id',
    });

  if (error) {
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/community/thread-subscriptions
 *
 * Unsubscribe from a post thread.
 * Body: { post_id }
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { post_id } = await req.json();
  if (!post_id) {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  await auth.supabase
    .from('community_thread_subscriptions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('post_id', post_id);

  return NextResponse.json({ ok: true });
}
