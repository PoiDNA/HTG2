import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Verify that the current user has publication access (role: publikacja, moderator, or admin).
 * Returns { supabase, user, role, isAdmin } on success, or a NextResponse error.
 */
export async function requirePublication(): Promise<
  | { supabase: Awaited<ReturnType<typeof createSupabaseServer>>; user: User; role: string; isAdmin: boolean }
  | { error: NextResponse }
> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

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
