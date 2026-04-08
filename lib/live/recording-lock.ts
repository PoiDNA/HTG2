import { createSupabaseServiceRole } from '@/lib/supabase/service';

const LOCK_DURATION_SECONDS = 60;

/**
 * Lease-based lock for starting the sesja composite egress.
 *
 * Prevents race condition where /api/live/phase and /api/live/consent
 * could both call startRoomCompositeEgress simultaneously, creating two
 * parallel egresses for the same session (waste of LiveKit resources,
 * duplicate webhooks, polluted R2 bucket).
 *
 * Lock is a timestamp (lease) that auto-expires after 60 seconds.
 * If a process crashes mid-egress-start, the lock self-heals — no need
 * for manual unlock or stuck-lock recovery scripts.
 *
 * Usage:
 *   const acquired = await acquireRecordingLock(sessionId);
 *   if (!acquired) return; // another process is starting recording
 *   try {
 *     // call LiveKit, update DB
 *     await db.from('live_sessions').update({ egress_sesja_id: ..., recording_lock_until: null });
 *   } catch (e) {
 *     await releaseRecordingLock(sessionId); // best-effort early release
 *     throw e;
 *   }
 *
 * Returns true if lock was acquired (UPDATE affected 1 row), false otherwise.
 */
export async function acquireRecordingLock(sessionId: string): Promise<boolean> {
  const db = createSupabaseServiceRole();
  const lockUntil = new Date(Date.now() + LOCK_DURATION_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Atomic lock acquisition: only succeeds if lock is NULL or already expired,
  // AND egress_sesja_id is still NULL (no one already started egress).
  const { data, error } = await db
    .from('live_sessions')
    .update({ recording_lock_until: lockUntil })
    .eq('id', sessionId)
    .or(`recording_lock_until.is.null,recording_lock_until.lt.${nowIso}`)
    .is('egress_sesja_id', null)
    .select('id');

  if (error) {
    console.error('[recording-lock] acquire failed:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Release the recording lock (clear the lease timestamp).
 * Call this on early exit from lock-protected section (e.g. LiveKit error
 * before egress_sesja_id was set).
 */
export async function releaseRecordingLock(sessionId: string): Promise<void> {
  const db = createSupabaseServiceRole();
  await db
    .from('live_sessions')
    .update({ recording_lock_until: null })
    .eq('id', sessionId);
}
