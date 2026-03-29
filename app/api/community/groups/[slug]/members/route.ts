import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/groups/[slug]/members
 *
 * List group members with profile info.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  // Fetch group
  const { data: group } = await supabase
    .from('community_groups')
    .select('id, visibility')
    .eq('slug', slug)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  // Access check
  if (group.visibility === 'staff_only' && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (group.visibility === 'private' && !isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Fetch members with profiles
  const { data: memberships, error } = await supabase
    .from('community_memberships')
    .select('id, user_id, role, joined_at')
    .eq('group_id', group.id)
    .order('joined_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }

  // Fetch profiles for all members
  const userIds = (memberships ?? []).map(m => m.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .in('id', userIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map(p => [p.id, p])
  );

  const result = (memberships ?? []).map(m => ({
    ...m,
    profile: profileMap.get(m.user_id) ?? null,
  }));

  return NextResponse.json(result);
}
