import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/groups/[slug]/join
 *
 * Join a public group. Users can only join public groups themselves.
 * Private/staff groups require admin invitation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Fetch group
  const { data: group } = await supabase
    .from('community_groups')
    .select('id, visibility, is_archived')
    .eq('slug', slug)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  if (group.is_archived) {
    return NextResponse.json({ error: 'Group is archived' }, { status: 400 });
  }

  if (group.visibility !== 'public') {
    return NextResponse.json({ error: 'Can only join public groups directly' }, { status: 403 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('community_memberships')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Already a member' }, { status: 409 });
  }

  // Join
  const { data: membership, error } = await supabase
    .from('community_memberships')
    .insert({
      group_id: group.id,
      user_id: user.id,
      role: 'member',
    })
    .select()
    .single();

  if (error) {
    console.error('Error joining group:', error);
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 });
  }

  return NextResponse.json(membership, { status: 201 });
}

/**
 * DELETE /api/community/groups/[slug]/join
 *
 * Leave a group.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { data: group } = await supabase
    .from('community_groups')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('community_memberships')
    .delete()
    .eq('group_id', group.id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to leave group' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
