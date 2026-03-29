import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth, resolveGroupSlug, requireGroupAccess } from '@/lib/community/auth';

/**
 * GET /api/community/groups/[slug]
 *
 * Get group details by slug.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;

  const { data: group, error } = await supabase
    .from('community_groups')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  // Visibility check
  if (group.visibility === 'staff_only' && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get membership info
  const { data: membership } = await supabase
    .from('community_memberships')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single();

  // Private group: require membership
  if (group.visibility === 'private' && !membership && !isAdmin && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get member count
  const { count: memberCount } = await supabase
    .from('community_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id);

  return NextResponse.json({
    ...group,
    member_count: memberCount ?? 0,
    is_member: !!membership || isAdmin || isStaff,
    membership_role: membership?.role ?? null,
  });
}

/**
 * PATCH /api/community/groups/[slug]
 *
 * Update group details. Admin only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Only admins can edit groups' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, visibility, is_archived, image_url } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (visibility !== undefined) updates.visibility = visibility;
  if (is_archived !== undefined) updates.is_archived = is_archived;
  if (image_url !== undefined) updates.image_url = image_url;

  const { data: group, error } = await auth.supabase
    .from('community_groups')
    .update(updates)
    .eq('slug', slug)
    .select()
    .single();

  if (error || !group) {
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }

  return NextResponse.json(group);
}
