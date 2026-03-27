import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { User } from '@supabase/supabase-js';

type ServiceClient = ReturnType<typeof createSupabaseServiceRole>;

/**
 * Verify that the current user has publication access (role: publikacja, moderator, or admin).
 * Uses service role client for data queries to bypass RLS.
 * Returns { supabase, user, role, isAdmin } on success, or a NextResponse error.
 */
export async function requirePublication(): Promise<
  | { supabase: ServiceClient; user: User; role: string; isAdmin: boolean }
  | { error: NextResponse }
> {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = createSupabaseServiceRole();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'user';
  const allowedRoles = ['publikacja', 'moderator', 'admin'];

  if (!allowedRoles.includes(role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const isAdmin = role === 'admin' || role === 'moderator';

  return { supabase, user, role, isAdmin };
}
