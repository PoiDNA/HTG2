import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { StaffMember } from '@/lib/booking/types';

/**
 * Verify that the current user is a staff member.
 * Matches by user_id first, then by email.
 * Also allows admin/moderator role users.
 * Returns { supabase, user, staffMember } on success, or a NextResponse error.
 */
export async function requireStaff() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Check if user is admin/moderator (they can access staff panel too)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Try to find staff member by user_id
  let { data: staffMember } = await supabase
    .from('staff_members')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  // If not found by user_id, try by email
  if (!staffMember && user.email) {
    const { data: byEmail } = await supabase
      .from('staff_members')
      .select('*')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();
    staffMember = byEmail;
  }

  // Allow admin/moderator even without staff_member record
  const isAdminOrMod = profile?.role === 'admin' || profile?.role === 'moderator';

  if (!staffMember && !isAdminOrMod) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase, user, staffMember: staffMember as StaffMember | null };
}
