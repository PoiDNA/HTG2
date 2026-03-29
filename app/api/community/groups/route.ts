import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/groups
 *
 * List groups the user can see:
 * - Groups they're a member of
 * - Public groups (for "discover" section)
 * - Staff-only groups (if user is staff/admin)
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  // Get user's memberships
  const { data: memberships } = await supabase
    .from('community_memberships')
    .select('group_id, role')
    .eq('user_id', user.id);

  const memberGroupIds = (memberships ?? []).map(m => m.group_id);

  // Fetch all visible groups with member counts
  let query = supabase
    .from('community_groups')
    .select('*, community_memberships(count)')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  // Non-staff users can only see public groups and their own groups
  if (!isStaff) {
    // Fetch public groups + groups the user is a member of
    query = query.or(
      `visibility.eq.public${memberGroupIds.length > 0 ? `,id.in.(${memberGroupIds.join(',')})` : ''}`
    );
  }

  const { data: groups, error } = await query;

  if (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }

  // Get last post activity for each group
  const groupIds = (groups ?? []).map(g => g.id);
  const { data: lastPosts } = groupIds.length > 0
    ? await supabase
        .from('community_posts')
        .select('group_id, last_activity_at')
        .in('group_id', groupIds)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false })
    : { data: [] };

  // Build last_post_at map (first post per group = most recent)
  const lastPostMap = new Map<string, string>();
  for (const post of lastPosts ?? []) {
    if (!lastPostMap.has(post.group_id)) {
      lastPostMap.set(post.group_id, post.last_activity_at);
    }
  }

  // Build membership lookup
  const membershipMap = new Map(
    (memberships ?? []).map(m => [m.group_id, m.role])
  );

  const result = (groups ?? []).map(group => ({
    ...group,
    member_count: group.community_memberships?.[0]?.count ?? 0,
    is_member: membershipMap.has(group.id) || isAdmin || isStaff,
    membership_role: membershipMap.get(group.id) ?? null,
    last_post_at: lastPostMap.get(group.id) ?? null,
    community_memberships: undefined, // Remove raw join data
  }));

  return NextResponse.json(result);
}

/**
 * POST /api/community/groups
 *
 * Create a new group. Admin only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Only admins can create groups' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, slug, visibility, type, image_url } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, { status: 400 });
  }

  const { data: group, error } = await auth.supabase
    .from('community_groups')
    .insert({
      name,
      description: description || null,
      slug,
      visibility: visibility || 'private',
      type: type || 'topic',
      image_url: image_url || null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Group with this slug already exists' }, { status: 409 });
    }
    console.error('Error creating group:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }

  // Auto-add creator as admin member
  await auth.supabase
    .from('community_memberships')
    .insert({
      group_id: group.id,
      user_id: auth.user.id,
      role: 'admin',
    });

  return NextResponse.json(group, { status: 201 });
}
