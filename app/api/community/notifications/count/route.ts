import { NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/notifications/count
 *
 * Lightweight endpoint for notification badge count.
 */
export async function GET() {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { count, error } = await supabase
    .from('community_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) {
    return NextResponse.json({ error: 'Failed to count' }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
