import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import type { CommunityGroup, CommunityMembership } from './types';

export interface CommunityAuthResult {
  supabase: ReturnType<typeof createSupabaseServiceRole>;
  user: { id: string; email: string };
  isAdmin: boolean;
  isStaff: boolean;
}

export interface CommunityAuthError {
  error: NextResponse;
}

export const COMMUNITY_MOD_ROLES = ['moderator', 'admin'] as const;
export type CommunityMemberRole = typeof COMMUNITY_MOD_ROLES[number];
export function isCommunityModerator(role: string | null | undefined): role is CommunityMemberRole {
  return role === 'moderator' || role === 'admin';
}

/**
 * Verify that the current request comes from an authenticated user.
 * Returns service-role client for all subsequent data operations.
 */
export async function requireCommunityAuth(): Promise<CommunityAuthResult | CommunityAuthError> {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  return {
    supabase: createSupabaseServiceRole(),
    user: { id: user.id, email },
    isAdmin,
    isStaff,
  };
}

export interface GroupMemberResult extends CommunityAuthResult {
  group: CommunityGroup;
  membership: CommunityMembership | null;
  canWrite: boolean;
  canModerate: boolean;
}

/**
 * Verify that the current user has access to a specific group.
 * Admin/staff always have access. Regular users need membership.
 * For public groups, non-members get read-only access.
 */
export async function requireGroupAccess(
  groupId: string,
  options: { requireWrite?: boolean } = {}
): Promise<GroupMemberResult | CommunityAuthError> {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth;

  const { supabase, user, isAdmin, isStaff } = auth;

  // Fetch group
  const { data: group, error: groupError } = await supabase
    .from('community_groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  }

  // Staff-only groups: only staff/admin
  if (group.visibility === 'staff_only' && !isStaff) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  // Fetch membership (if exists)
  const { data: membership } = await supabase
    .from('community_memberships')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single();

  // Determine permissions
  const isMember = !!membership || isAdmin || isStaff;
  const canWrite = isMember;
  const canModerate = isAdmin || isStaff || isCommunityModerator(membership?.role);

  // Private groups: require membership
  if (group.visibility === 'private' && !isMember) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  // Public groups: non-members can read, but not write
  if (options.requireWrite && !canWrite) {
    return { error: NextResponse.json({ error: 'Join group to post' }, { status: 403 }) };
  }

  return {
    supabase,
    user,
    isAdmin,
    isStaff,
    group: group as CommunityGroup,
    membership: membership as CommunityMembership | null,
    canWrite,
    canModerate,
  };
}

/**
 * Resolve group by slug, returning the group ID.
 */
export async function resolveGroupSlug(slug: string): Promise<string | null> {
  const supabase = createSupabaseServiceRole();
  const { data } = await supabase
    .from('community_groups')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id ?? null;
}
