import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth, isCommunityModerator } from '@/lib/community/auth';
import crypto from 'crypto';

/**
 * POST /api/community/invite
 *
 * Generate an invite link for a group. Admin or group moderator.
 * Body: { group_id, max_uses?: number, expires_in_days?: number }
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;
  const body = await req.json();
  const { group_id, max_uses, expires_in_days } = body;

  if (!group_id) {
    return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
  }

  // Check permission: admin, staff, or group moderator
  if (!isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !isCommunityModerator(membership.role)) {
      return NextResponse.json({ error: 'Only moderators can create invites' }, { status: 403 });
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: invite, error } = await supabase
    .from('community_invite_links')
    .insert({
      group_id,
      token,
      created_by: user.id,
      max_uses: max_uses || null,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://htgcyou.com';
  const inviteUrl = `${baseUrl}/pl/spolecznosc/dolacz/${token}`;

  return NextResponse.json({ ...invite, invite_url: inviteUrl }, { status: 201 });
}

/**
 * GET /api/community/invite?group_id=
 *
 * List active invite links for a group. Admin/moderator only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user, isAdmin, isStaff } = auth;
  const groupId = req.nextUrl.searchParams.get('group_id');
  if (!groupId) {
    return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
  }

  if (!isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !isCommunityModerator(membership.role)) {
      return NextResponse.json({ error: 'Only moderators can view invites' }, { status: 403 });
    }
  }

  const { data: invites } = await auth.supabase
    .from('community_invite_links')
    .select('*')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://htgcyou.com';

  return NextResponse.json(
    (invites ?? []).map(inv => ({
      ...inv,
      invite_url: `${baseUrl}/pl/spolecznosc/dolacz/${inv.token}`,
    }))
  );
}
