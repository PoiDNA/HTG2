import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

/**
 * Verify that the current request comes from an admin user.
 * Uses session client to authenticate, then returns service-role client
 * (bypasses RLS) for all subsequent data operations.
 */
export async function requireAdmin() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!isAdminEmail(user.email ?? '')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase: createSupabaseServiceRole(), user };
}
