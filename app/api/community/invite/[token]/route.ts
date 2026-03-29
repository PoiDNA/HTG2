import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * POST /api/community/invite/[token]
 *
 * Accept an invite link and join the group.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Find the invite
  const { data: invite } = await supabase
    .from('community_invite_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Zaproszenie nie istnieje lub wygasło' }, { status: 404 });
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Zaproszenie wygasło' }, { status: 410 });
  }

  // Check max uses
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    return NextResponse.json({ error: 'Zaproszenie osiągnęło limit użyć' }, { status: 410 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('community_memberships')
    .select('id')
    .eq('group_id', invite.group_id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ group_id: invite.group_id, already_member: true });
  }

  // Join the group
  const { error: joinError } = await supabase
    .from('community_memberships')
    .insert({
      group_id: invite.group_id,
      user_id: user.id,
      role: 'member',
    });

  if (joinError) {
    return NextResponse.json({ error: 'Nie udało się dołączyć' }, { status: 500 });
  }

  // Increment use count
  await supabase
    .from('community_invite_links')
    .update({ use_count: invite.use_count + 1 })
    .eq('id', invite.id);

  // Get group slug for redirect
  const { data: group } = await supabase
    .from('community_groups')
    .select('slug, name')
    .eq('id', invite.group_id)
    .single();

  return NextResponse.json({
    group_id: invite.group_id,
    group_slug: group?.slug,
    group_name: group?.name,
    joined: true,
  }, { status: 201 });
}

/**
 * GET /api/community/invite/[token]
 *
 * Get invite info (group name, etc.) without joining.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { data: invite } = await supabase
    .from('community_invite_links')
    .select('group_id, expires_at, max_uses, use_count')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Zaproszenie nie istnieje' }, { status: 404 });
  }

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date();
  const maxedOut = invite.max_uses && invite.use_count >= invite.max_uses;

  const { data: group } = await supabase
    .from('community_groups')
    .select('name, description, slug')
    .eq('id', invite.group_id)
    .single();

  const { data: membership } = await supabase
    .from('community_memberships')
    .select('id')
    .eq('group_id', invite.group_id)
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    group_name: group?.name,
    group_description: group?.description,
    group_slug: group?.slug,
    is_valid: !expired && !maxedOut,
    is_member: !!membership,
  });
}
