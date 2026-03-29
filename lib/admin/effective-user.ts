import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from './impersonate-const';
import type { SupabaseClient } from '@supabase/supabase-js';

interface EffectiveUser {
  /** The user ID to use for all data queries (impersonated or real). */
  userId: string;
  /** Supabase client — service-role when impersonating (bypasses RLS), normal otherwise. */
  supabase: SupabaseClient;
  /** True when admin is viewing as another user. */
  isImpersonating: boolean;
}

/**
 * Returns the effective user ID and a matching Supabase client.
 * When an admin has the impersonation cookie set, the returned userId
 * is the impersonated user and the client uses service-role to bypass RLS.
 */
export async function getEffectiveUser(): Promise<EffectiveUser> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (user.email && isAdminEmail(user.email)) {
    const cookieStore = await cookies();
    const viewAsUserId = cookieStore.get(IMPERSONATE_USER_COOKIE)?.value;
    if (viewAsUserId) {
      return {
        userId: viewAsUserId,
        supabase: createSupabaseServiceRole(),
        isImpersonating: true,
      };
    }
  }

  return { userId: user.id, supabase, isImpersonating: false };
}
