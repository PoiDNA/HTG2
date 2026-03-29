import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/notifications?cursor=&limit=20
 *
 * Fetch notifications for the current user.
 */
export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get('cursor');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50);

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  let query = supabase
    .from('community_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: notifications, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }

  const items = notifications ?? [];
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  // Fetch actor profiles
  const actorIds = [...new Set(items.map(n => n.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', actorIds as string[])
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Fetch group info for notifications
  const groupIds = [...new Set(items.map(n => n.group_id).filter(Boolean))];
  const { data: groups } = groupIds.length > 0
    ? await supabase.from('community_groups').select('id, name, slug').in('id', groupIds as string[])
    : { data: [] };
  const groupMap = new Map((groups ?? []).map(g => [g.id, g]));

  const lastItem = items[items.length - 1];

  return NextResponse.json({
    items: items.map(n => ({
      ...n,
      actor: n.actor_id ? profileMap.get(n.actor_id) ?? null : null,
      group_name: n.group_id ? groupMap.get(n.group_id)?.name ?? null : null,
      group_slug: n.group_id ? groupMap.get(n.group_id)?.slug ?? null : null,
    })),
    next_cursor: hasMore && lastItem ? lastItem.created_at : null,
    has_more: hasMore,
  });
}
