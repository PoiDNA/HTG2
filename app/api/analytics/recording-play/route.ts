import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';

// Upper bound for client-reported playback duration — prevents analytics
// poisoning where a user could call `stop` with durationSeconds=99999999
// to fake heavy usage. Artificial ceiling of 1 hour (3600s) is generous
// for 5-minute recordings with pause/resume, and keeps dashboard metrics
// obviously bounded.
const MAX_PLAY_DURATION_SECONDS = 3600;

/**
 * POST /api/analytics/recording-play
 * Body: { action: 'start'|'stop', recordingId?, eventId?, durationSeconds? }
 * Tracks plays for client recordings (nagrania przed/po).
 *
 * CONTRACT CHANGE from previous version: returns 401 for anonymous instead of
 * `{ ok: true }`. Frontend ignores all errors (`.catch(() => {})`) so UX is
 * unchanged, but any observability/metrics layer will now see the true
 * anonymous-attempt rate instead of treating them as success.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, recordingId, eventId, durationSeconds } = await request.json();
    const db = createSupabaseServiceRole();

    if (action === 'stop' && eventId) {
      // Clamp client-reported duration to prevent analytics poisoning.
      // JSON may deliver durationSeconds as a string (e.g. "120") — coerce
      // via Number() before type-checking. Accept only finite non-negative values.
      const rawNum = Number(durationSeconds);
      const safeDuration = Number.isFinite(rawNum) && rawNum >= 0
        ? Math.min(rawNum, MAX_PLAY_DURATION_SECONDS)
        : null;

      const { error } = await db
        .from('recording_play_events')
        .update({
          ended_at: new Date().toISOString(),
          play_duration_seconds: safeDuration,
        })
        .eq('id', eventId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[recording-play] stop update failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'start' && recordingId) {
      // Verify access to this recording — for both user and staff:
      // - User: must own the recording. Returns 403 for both "not found" and
      //   "owned by someone else" to avoid oracle enumeration of recording IDs.
      // - Staff: recording must exist (prevents 500 from FK violation on
      //   non-existent UUID; staff can legitimately know about existence).
      const staff = isStaffEmail(user.email ?? '');

      if (staff) {
        const { data: rec } = await db
          .from('client_recordings')
          .select('id')
          .eq('id', recordingId)
          .maybeSingle();
        if (!rec) {
          return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }
      } else {
        const { data: rec } = await db
          .from('client_recordings')
          .select('id')
          .eq('id', recordingId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!rec) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      const { data, error } = await db
        .from('recording_play_events')
        .insert({
          user_id: user.id,
          recording_id: recordingId,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('[recording-play] start insert failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Audit write (Faza 6): log who played this recording and when.
      // Best-effort — if the audit insert fails we still return the event ID
      // to the client, because the play event itself was recorded successfully
      // and telemetry shouldn't block playback.
      try {
        await db.from('client_recording_audit').insert({
          recording_id: recordingId,
          actor_id: user.id,
          action: 'played',
          details: {
            event_id: data?.id,
            is_staff: staff,
          },
        });
      } catch (auditErr) {
        console.error('[recording-play] audit write failed (non-fatal):', auditErr);
      }

      return NextResponse.json({ eventId: data?.id });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[recording-play] handler error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
