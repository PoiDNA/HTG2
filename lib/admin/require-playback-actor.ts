// Jednolita rezolucja scope staff/admin dla booking-recording playback + assign.
// Używane przez:
//   - app/api/video/booking-recording-token/route.ts (staff bypass)
//   - app/api/admin/users/search/route.ts (auth gate)
//   - app/api/recordings/participants/route.ts (auth gate + scope)
//   - lib/recordings/assign-for-actor.ts (server actions scope check)
//
// Plik NIE ma 'use server' — bezpieczny do importu w route handlers, server
// components i server actions bez granicy bundlera.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isAdminEmail } from '@/lib/roles';

export type PlaybackScope =
  | { role: 'admin' }
  | { role: 'practitioner' }
  | { role: 'assistant'; sessionTypes: string[] };

/**
 * Rezolwuje role i scope odtwarzania/przydzielania nagrań dla aktualnego usera.
 *
 * Zwraca null = brak uprawnień (non-staff, non-admin).
 *
 * Kolejność:
 *   1. Jeśli email w ADMIN_EMAILS → { role: 'admin' }
 *   2. Lookup `staff_members` najpierw po `user_id` (primary), fallback po `email`.
 *      Odporniejsze niż sam email — user_id zlinkowany trzymamy za preferencję.
 *   3. `staff_members.role === 'practitioner'` → { role: 'practitioner' }
 *   4. Inny aktywny staff → { role: 'assistant', sessionTypes: staff.session_types || [] }
 *   5. Brak → null
 *
 * Parametr `db` = klient service role (caller przekazuje swoje instance,
 * żeby uniknąć duplikowanego klienta per request).
 */
export async function resolveStaffPlaybackScope(
  user: User | null,
  db: SupabaseClient,
): Promise<PlaybackScope | null> {
  if (!user) return null;

  const email = user.email ?? '';
  if (isAdminEmail(email)) return { role: 'admin' };

  // Staff lookup: user_id first (primary), fallback by email
  let staff: { role: string | null; session_types: string[] | null } | null = null;

  const byUserId = await db
    .from('staff_members')
    .select('role, session_types, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (byUserId.data) {
    staff = byUserId.data;
  } else if (email) {
    const byEmail = await db
      .from('staff_members')
      .select('role, session_types, is_active')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();
    if (byEmail.data) staff = byEmail.data;
  }

  if (!staff) return null;

  if (staff.role === 'practitioner') return { role: 'practitioner' };

  return { role: 'assistant', sessionTypes: staff.session_types || [] };
}

/**
 * Sprawdza czy dany session_type mieści się w scope'ie staff.
 * - admin / practitioner → zawsze true
 * - assistant → tylko jeśli session_type ∈ staff.session_types
 * - null → false
 */
export function isSessionTypeInScope(
  scope: PlaybackScope | null,
  sessionType: string,
): boolean {
  if (!scope) return false;
  if (scope.role === 'admin' || scope.role === 'practitioner') return true;
  return scope.sessionTypes.includes(sessionType);
}
