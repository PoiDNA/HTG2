import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import {
  startRoomCompositeEgress,
  startParticipantEgress,
  stopEgress,
  listEgress,
  listRoomParticipants,
} from '@/lib/live/livekit';
import { canControlRecording } from '@/lib/live/recording-auth';

const COOLDOWN_SECONDS = 60;

/**
 * POST /api/live/retry-recording
 * Body: { sessionId: string }
 *
 * Manual retry action for staff when monitoring shows recording is broken.
 * Restarts the sesja composite egress AND all participant track egresses
 * (so post-production gets separate audio tracks even after a full crash).
 *
 * Safeguards:
 *   1. Auth: same matrix as recording-status (admin/staff/assistant)
 *   2. Cooldown: 60s anti-spam (DB-stored, not in-memory)
 *   3. Idempotency: skip if egress is actually still running in LiveKit
 *   4. RODO consent re-check: only retry if all participants have consented
 *   5. Stop zombie egress: try to stop the old egress before starting new
 *   6. Track restart: per-participant egresses also restart (for editing)
 *   7. Audit log
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Auth check (same matrix as recording-status)
    const allowed = await canControlRecording(user.id, user.email, sessionId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = createSupabaseServiceRole();
    const { data: session } = await db
      .from('live_sessions')
      .select('id, room_name, phase, booking_id, egress_sesja_id, last_retry_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.phase !== 'sesja') {
      return NextResponse.json({ error: 'Retry only allowed during sesja phase' }, { status: 400 });
    }

    // ── Cooldown check ────────────────────────────────────────────────────
    if (session.last_retry_at) {
      const elapsed = (Date.now() - new Date(session.last_retry_at).getTime()) / 1000;
      if (elapsed < COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: `Cooldown active. Please wait ${Math.ceil(COOLDOWN_SECONDS - elapsed)}s.` },
          { status: 429 },
        );
      }
    }

    // ── Idempotency: check if egress is actually running in LiveKit ───────
    if (session.egress_sesja_id) {
      try {
        const egresses = await listEgress(session.room_name);
        const stillActive = egresses.find((e) => e.egressId === session.egress_sesja_id);
        if (stillActive) {
          return NextResponse.json(
            { ok: true, message: 'Egress already running, no retry needed', skipped: true },
            { status: 200 },
          );
        }
      } catch (e) {
        // Could not verify — proceed with caution
        console.warn('[retry-recording] listEgress failed, proceeding with retry:', e);
      }
    }

    // ── RODO consent re-check ─────────────────────────────────────────────
    // Cannot use check_recording_consent RPC because it returns 'already_recording'
    // when egress_sesja_id is set. Manual check instead.
    const { data: booking } = await db
      .from('bookings')
      .select('id, user_id, session_type')
      .eq('id', session.booking_id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Required consent count: 1 for solo, 1 + companions for para
    let requiredCount = 1;
    if (booking.session_type === 'natalia_para') {
      const { count } = await db
        .from('booking_companions')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', session.booking_id)
        .eq('status', 'accepted');
      requiredCount = 1 + (count ?? 0);
    }

    const { count: grantedCount } = await db
      .from('consent_records')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', session.booking_id)
      .eq('consent_type', 'session_recording_capture')
      .eq('granted', true);

    if ((grantedCount ?? 0) < requiredCount) {
      return NextResponse.json(
        {
          error: 'Cannot retry: incomplete consent',
          have: grantedCount ?? 0,
          need: requiredCount,
        },
        { status: 400 },
      );
    }

    // ── Stop zombie egress (best-effort) ──────────────────────────────────
    const oldEgressId = session.egress_sesja_id;
    if (oldEgressId) {
      try {
        await stopEgress(oldEgressId);
      } catch (e) {
        // LiveKit may return 404 if egress already gone — non-blocking
        console.warn('[retry-recording] stopEgress failed (non-blocking):', e);
      }
    }

    // ── Start new composite egress ────────────────────────────────────────
    let newEgressId: string;
    try {
      const compositeEgress = await startRoomCompositeEgress(session.room_name, { audioOnly: true });
      newEgressId = compositeEgress.egressId;
    } catch (e) {
      console.error('[retry-recording] Failed to start composite egress:', e);
      return NextResponse.json(
        { error: 'Failed to restart recording', details: e instanceof Error ? e.message : 'unknown' },
        { status: 500 },
      );
    }

    // ── Restart per-participant track egresses ────────────────────────────
    // Track egresses might have crashed too. Restart them so post-production
    // still gets separate audio tracks for editing.
    const newTrackEgressIds: Record<string, string> = {};
    try {
      const participants = await listRoomParticipants(session.room_name);
      for (const participant of participants) {
        if (!participant.identity) continue;
        try {
          const trackEgress = await startParticipantEgress(session.room_name, participant.identity);
          newTrackEgressIds[participant.identity] = trackEgress.egressId;
        } catch (e) {
          console.warn(`[retry-recording] Failed to restart track egress for ${participant.identity}:`, e);
        }
      }
    } catch (e) {
      console.warn('[retry-recording] Failed to list participants:', e);
    }

    // ── Update DB: new egress IDs + cooldown timestamp ────────────────────
    const update: Record<string, unknown> = {
      egress_sesja_id: newEgressId,
      last_retry_at: new Date().toISOString(),
    };
    if (Object.keys(newTrackEgressIds).length > 0) {
      update.egress_sesja_tracks_ids = newTrackEgressIds;
    }

    await db.from('live_sessions').update(update).eq('id', sessionId);

    // ── Audit log ─────────────────────────────────────────────────────────
    try {
      await db.from('admin_audit_log').insert({
        admin_id: user.id,
        action: 'retry_recording',
        details: {
          session_id: sessionId,
          email: user.email,
          old_egress_id: oldEgressId,
          new_egress_id: newEgressId,
          new_track_count: Object.keys(newTrackEgressIds).length,
        },
      });
    } catch (e) {
      // Audit failure non-blocking
      console.warn('[retry-recording] audit log failed:', e);
    }

    return NextResponse.json({
      ok: true,
      egressId: newEgressId,
      trackCount: Object.keys(newTrackEgressIds).length,
    });
  } catch (err) {
    console.error('[retry-recording] error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
