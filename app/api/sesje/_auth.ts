import { createSupabaseServer } from '@/lib/supabase/server';
import { canEditSesje, canDeleteSesje } from '@/lib/staff-config';

export async function requireSesjeEditor() {
  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !canEditSesje(user.email)) {
    return { user: null, isAdmin: false, error: 'forbidden' as const };
  }
  return { user, isAdmin: canDeleteSesje(user.email), error: null };
}
