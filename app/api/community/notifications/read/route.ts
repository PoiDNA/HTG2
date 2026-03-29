import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/notifications/read
 *
 * Mark notifications as read.
 * Body: { ids?: string[] } — if empty, marks all as read.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;
  const body = await req.json();
  const ids = body.ids as string[] | undefined;

  let query = supabase
    .from('community_notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (ids && ids.length > 0) {
    query = query.in('id', ids);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
