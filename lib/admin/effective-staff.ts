import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_COOKIE } from './impersonate';

/**
 * Returns the effective staff member for the current request.
 * If admin has set the impersonation cookie, returns that staff member instead.
 */
export async function getEffectiveStaffMember() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { user: null, staffMember: null, isAdminViewAs: false, viewAsName: null };

  const db = createSupabaseServiceRole();
  const cookieStore = await cookies();

  const isAdmin = isAdminEmail(user.email ?? '');
  const viewAsCookie = cookieStore.get(IMPERSONATE_COOKIE);

  // Admin impersonation
  if (isAdmin && viewAsCookie?.value) {
    const { data: staff } = await db
      .from('staff_members')
      .select('id, name, email, role, slug, session_types, is_active, user_id')
      .eq('id', viewAsCookie.value)
      .single();
    if (staff) {
      return { user, staffMember: staff, isAdminViewAs: true, viewAsName: staff.name };
    }
  }

  // Normal: find by user_id
  const { data: byId } = await db
    .from('staff_members')
    .select('id, name, email, role, slug, session_types, is_active, user_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (byId) return { user, staffMember: byId, isAdminViewAs: false, viewAsName: null };

  // Fallback: find by email
  if (user.email) {
    const { data: byEmail } = await db
      .from('staff_members')
      .select('id, name, email, role, slug, session_types, is_active, user_id')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();
    if (byEmail) return { user, staffMember: byEmail, isAdminViewAs: false, viewAsName: null };
  }

  return { user, staffMember: null, isAdminViewAs: false, viewAsName: null };
}
