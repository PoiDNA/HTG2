import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { isAdminEmail } from '@/lib/roles';
import type { StaffMember } from '@/lib/booking/types';

/**
 * Verify that the current user is a staff member.
 * Supports admin impersonation via getEffectiveStaffMember().
 * Returns { supabase, user, staffMember } on success, or a NextResponse error.
 */
export async function requireStaff() {
  const { user, staffMember } = await getEffectiveStaffMember();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Allow admin even without a staff_member record
  const isAdmin = isAdminEmail(user.email ?? '');

  if (!staffMember && !isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  // Use service role so impersonated queries aren't limited by admin's RLS scope
  const supabase = createSupabaseServiceRole();

  return { supabase, user, staffMember: staffMember as StaffMember | null };
}
