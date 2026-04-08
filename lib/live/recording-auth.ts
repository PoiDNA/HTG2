import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

/**
 * Authorization helper for HTG Meeting recording control actions
 * (control/start, control/end, control/* mutations).
 *
 * Intentionally narrower than canControlRecording() — staff email alone is
 * NOT sufficient for HTG Meetings. Any staff member would otherwise be able
 * to control any group meeting, including ones they're not moderating.
 *
 * Allowed:
 *   - Global admin (isAdminEmail)
 *   - User whose id == htg_meeting_sessions.moderator_id for this session
 */
export async function canControlMeetingRecording(
  userId: string,
  userEmail: string | null | undefined,
  meetingSessionId: string,
): Promise<boolean> {
  const email = userEmail ?? '';
  if (isAdminEmail(email)) return true;

  const db = createSupabaseServiceRole();
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('moderator_id')
    .eq('id', meetingSessionId)
    .maybeSingle();

  return session?.moderator_id === userId;
}

/**
 * Unified authorization helper for recording-status and retry-recording endpoints.
 *
 * Returns true if the user is allowed to monitor / control recording for the given session.
 * Authorization matrix:
 *   - Global admin (isAdminEmail) — full access
 *   - Main staff (isStaffEmail — Natalia, Agata, Justyna, Przemek) — full access
 *   - Assigned assistant — only if user.id matches staff_members.user_id of the slot's assistant_id
 *
 * IMPORTANT: booking_slots.assistant_id is a FK to staff_members.id, NOT auth.users.id.
 * Direct comparison user.id === assistant_id would always fail.
 */
export async function canControlRecording(
  userId: string,
  userEmail: string | null | undefined,
  sessionId: string,
): Promise<boolean> {
  const email = userEmail ?? '';
  if (isAdminEmail(email)) return true;
  if (isStaffEmail(email)) return true;

  // Assigned assistant check — JOIN through staff_members
  const db = createSupabaseServiceRole();
  const { data: session } = await db
    .from('live_sessions')
    .select('slot_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.slot_id) return false;

  const { data: slot } = await db
    .from('booking_slots')
    .select('assistant_id')
    .eq('id', session.slot_id)
    .maybeSingle();

  if (!slot?.assistant_id) return false;

  const { data: staffMember } = await db
    .from('staff_members')
    .select('id')
    .eq('id', slot.assistant_id)
    .eq('user_id', userId)
    .maybeSingle();

  return !!staffMember;
}
