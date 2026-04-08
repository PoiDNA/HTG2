import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * lib/live/meeting-recording-lock.ts
 *
 * Lease-based lock for starting HTG Meeting recording (composite + per-track
 * egresses). Analogous to lib/live/recording-lock.ts for Live Sessions but
 * operates on htg_meeting_sessions instead of live_sessions.
 *
 * The lock prevents race between multiple concurrent calls to control/start
 * for the same session (e.g. moderator double-clicks, admin + moderator race).
 * Only one caller can pass the acquire check; others see the lock held and
 * return early without attempting egress start.
 *
 * Lock is a timestamp (lease) that auto-expires after LOCK_DURATION_SECONDS.
 * If a process crashes mid-egress-start, the lock self-heals — no manual
 * unlock or stuck-lock recovery scripts.
 *
 * Schema requirement (migration 052):
 *   htg_meeting_sessions.recording_lock_until      TIMESTAMPTZ
 *   htg_meeting_sessions.composite_recording_started BOOLEAN DEFAULT false
 *
 * Usage in control/start:
 *   const acquired = await acquireMeetingRecordingLock(sessionId);
 *   if (!acquired) return NextResponse.json({ ok: true, recording: false });
 *   try {
 *     // ... two-phase commit for composite + tracks ...
 *     await db.from('htg_meeting_sessions').update({
 *       composite_recording_started: true,
 *       recording_lock_until: null,
 *     }).eq('id', sessionId);
 *   } catch (e) {
 *     await releaseMeetingRecordingLock(sessionId); // best-effort early release
 *     throw e;
 *   }
 */

const LOCK_DURATION_SECONDS = 60;

/**
 * Atomic lock acquisition.
 *
 * The UPDATE succeeds only when:
 *   1. recording_lock_until is NULL or already expired (no live lock), AND
 *   2. composite_recording_started is still false (nobody already started)
 *
 * If both conditions hold, the UPDATE writes a new lock_until timestamp and
 * returns 1 row. Otherwise returns 0 rows (lock lost / already started).
 *
 * Returns true if lock was acquired, false otherwise.
 */
export async function acquireMeetingRecordingLock(
  meetingSessionId: string,
): Promise<boolean> {
  const db = createSupabaseServiceRole();
  const lockUntil = new Date(Date.now() + LOCK_DURATION_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from('htg_meeting_sessions')
    .update({ recording_lock_until: lockUntil })
    .eq('id', meetingSessionId)
    .or(`recording_lock_until.is.null,recording_lock_until.lt.${nowIso}`)
    .eq('composite_recording_started', false)
    .select('id');

  if (error) {
    console.error('[meeting-recording-lock] acquire failed:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Release the lock (clear the lease timestamp).
 * Call this on early exit from the lock-protected section (e.g. LiveKit
 * API error before composite_recording_started was set).
 */
export async function releaseMeetingRecordingLock(meetingSessionId: string): Promise<void> {
  const db = createSupabaseServiceRole();
  await db
    .from('htg_meeting_sessions')
    .update({ recording_lock_until: null })
    .eq('id', meetingSessionId);
}
