import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { EDITOR_EMAILS } from '@/lib/roles';

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

/**
 * Tak jak requireAdmin, ale dopuszcza również edytorów (rola 'editor'
 * w staff-config). Używane dla narzędzi edycyjnych typu segmentacja
 * Momentów — admin + edytorzy mogą zapisywać fragmenty.
 */
export async function requireAdminOrEditor() {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = (user.email ?? '').toLowerCase();
  const allowed = isAdminEmail(email) || EDITOR_EMAILS.includes(email);

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    supabase: createSupabaseServiceRole(),
    user,
    role: isAdminEmail(email) ? ('admin' as const) : ('editor' as const),
  };
}
