// ============================================================
// HTG Communication Hub — Auth helpers
// Allows admins (full access) + staff with mailbox membership
// ============================================================

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

/**
 * Verify that the current request comes from an admin or staff member.
 * Returns service-role client + user info + role flags.
 */
export async function requireEmailAccess() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email);

  // Check profile role too
  const db = createSupabaseServiceRole();
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  const profileAdmin = profile?.role === 'admin';
  const profileStaff = profile?.role === 'moderator' || profileAdmin;

  if (!isAdmin && !isStaff && !profileAdmin && !profileStaff) {
    return { error: NextResponse.json({ error: 'Forbidden — not staff' }, { status: 403 }) };
  }

  return {
    supabase: db,
    user,
    isAdmin: isAdmin || profileAdmin,
  };
}

/**
 * Check if a user is admin or member of a specific mailbox.
 * Used by send/route.ts and portal/admin-reply to verify mailbox access.
 */
export async function isAdminOrMailboxMember(
  db: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  mailboxId: string | null
): Promise<boolean> {
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).single();
  if (profile?.role === 'admin') return true;

  if (!mailboxId) return false;
  const { data } = await db
    .from('mailbox_members')
    .select('id')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * Get mailbox IDs this user has access to.
 * Admins get all mailboxes. Staff get only their memberships.
 */
export async function getUserMailboxIds(userId: string, isAdmin: boolean): Promise<string[]> {
  const db = createSupabaseServiceRole();

  if (isAdmin) {
    const { data } = await db.from('mailboxes').select('id').eq('is_active', true);
    return (data || []).map((m: any) => m.id);
  }

  const { data } = await db
    .from('mailbox_members')
    .select('mailbox_id')
    .eq('user_id', userId);
  return (data || []).map((m: any) => m.mailbox_id);
}
