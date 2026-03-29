import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';
import { createNotification } from '@/lib/community/notifications';

/**
 * POST /api/community/groups/[slug]/add-member
 *
 * Add a member to a group by email. Admin only.
 * Body: { email: string, role?: 'member' | 'moderator' }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Only admins can add members' }, { status: 403 });
  }

  const { supabase } = auth;
  const body = await req.json();
  const { email, role = 'member' } = body;

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  // Find group
  const { data: group } = await supabase
    .from('community_groups')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  // Find user by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', email.toLowerCase())
    .single();

  if (!profile) {
    return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('community_memberships')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', profile.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'User is already a member' }, { status: 409 });
  }

  // Add membership
  const { error: insertError } = await supabase
    .from('community_memberships')
    .insert({
      group_id: group.id,
      user_id: profile.id,
      role,
    });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }

  // Send notification to the added user
  await createNotification({
    userId: profile.id,
    actorId: auth.user.id,
    type: 'group_invite',
    targetType: 'post', // Not ideal, but works with existing schema
    targetId: group.id,
    groupId: group.id,
  });

  return NextResponse.json({
    user_id: profile.id,
    display_name: profile.display_name,
    email: profile.email,
    role,
  }, { status: 201 });
}
