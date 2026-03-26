import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * Verify that the current user has admin role.
 * Returns { supabase, user } on success, or a NextResponse error.
 */
export async function requireAdmin() {
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

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase, user };
}
