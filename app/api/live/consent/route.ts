import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { startRoomCompositeEgress, startParticipantEgress, listRoomParticipants } from '@/lib/live/livekit';
import { acquireRecordingLock, releaseRecordingLock } from '@/lib/live/recording-lock';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

/**
 * POST /api/live/consent
 * Records session recording consent and attempts to start Egress if all consents are present.
 * One UI checkbox → two consent records (capture + access).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // ── IDOR fix: verify user has a relationship with this booking ──────
    // Without this check, any authenticated user could submit consent for
    // any bookingId they could guess (RODO violation + potential to trigger
    // recording for someone else's session).
    const { data: bookingOwner } = await db
      .from('bookings')
      .select('user_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (!bookingOwner) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    let isAuthorized = bookingOwner.user_id === user.id;

    if (!isAuthorized) {
      // Check accepted companion (para session)
      const { data: companion } = await db
        .from('booking_companions')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('user_id', user.id)
        .eq('status', 'accepted')
        .maybeSingle();
      isAuthorized = !!companion;
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'You are not a participant of this booking' },
        { status: 403 },
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';
    const ua = request.headers.get('user-agent') ?? '';

    // One checkbox → two consent records
    const consentTypes = ['session_recording_capture', 'session_recording_access'] as const;
    const consentTexts: Record<string, string> = {
      session_recording_capture:
        'Wyrażam zgodę na utrwalenie fazy sesyjnej mojego spotkania.',
      session_recording_access:
        'Wyrażam zgodę na przechowywanie nagrania i udostępnienie mi go przez okres do 12 miesięcy.',
    };

    for (const consentType of consentTypes) {
      // Idempotent — skip if already exists
      const { data: existing } = await db
        .from('consent_records')
        .select('id')
        .eq('user_id', user.id)
        .eq('booking_id', bookingId)
        .eq('consent_type', consentType)
        .maybeSingle();

      if (existing) continue;

      await db.from('consent_records').insert({
        user_id: user.id,
        booking_id: bookingId,
        consent_type: consentType,
        consent_text: consentTexts[consentType],
        ip_address: ip,
        user_agent: ua,
        granted: true,
      });
    }

    // Audit
    await db.from('booking_recording_audit').insert([
      { recording_id: bookingId, action: 'consent_capture_granted', actor_id: user.id,
        details: { booking_id: bookingId } },
      { recording_id: bookingId, action: 'consent_access_granted', actor_id: user.id,
        details: { booking_id: bookingId } },
    ]);

    // Try to start recording if consent is now complete
    const result = await tryStartRecording(db, bookingId);

    return NextResponse.json({
      ok: true,
      recording: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[consent] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Check if all required consents are present and start Egress if so.
 * Uses DB-level FOR UPDATE lock via RPC to prevent concurrent starts.
 */
async function tryStartRecording(
  db: ReturnType<typeof createSupabaseServiceRole>,
  bookingId: string
): Promise<{ started: boolean; reason: string }> {
  // RPC: read-only validator with FOR UPDATE lock
  const { data: checkResult, error: rpcError } = await db.rpc('check_recording_consent', {
    p_booking_id: bookingId,
  });

  if (rpcError) {
    console.error('[consent] RPC error:', rpcError.message);
    return { started: false, reason: 'rpc_error' };
  }

  const result = Array.isArray(checkResult) ? checkResult[0] : checkResult;

  if (!result?.can_start) {
    return { started: false, reason: result?.reason ?? 'unknown' };
  }

  // RPC said we CAN start — now actually call LiveKit
  const sessionId = result.session_id;
  const roomName = result.room_name;

  // ── Race condition fix: lease lock ───────────────────────────────────
  // /api/live/phase may be racing to start egress. Only one wins.
  const lockAcquired = await acquireRecordingLock(sessionId);
  if (!lockAcquired) {
    console.log(`[consent] Recording lock held — phase endpoint already starting egress for ${sessionId}`);
    return { started: false, reason: 'lock_held_by_phase' };
  }

  try {
    // Start composite audio egress
    const compositeEgress = await startRoomCompositeEgress(roomName, { audioOnly: true });

    // Update live_sessions — this is the source of truth
    // Release lock atomically by setting recording_lock_until = null in same UPDATE
    await db.from('live_sessions').update({
      egress_sesja_id: compositeEgress.egressId,
      recording_lock_until: null,
      metadata: { recording_pending: false, recording_consent_triggered: true },
    }).eq('id', sessionId);

    // Start per-participant track egresses
    try {
      const participants = await listRoomParticipants(roomName);
      const trackEgressIds: Record<string, string> = {};

      for (const participant of participants) {
        if (!participant.identity) continue;
        try {
          const egress = await startParticipantEgress(roomName, participant.identity);
          trackEgressIds[participant.identity] = egress.egressId;
        } catch (e) {
          console.warn(`[consent] Failed to start track egress for ${participant.identity}:`, e);
        }
      }

      if (Object.keys(trackEgressIds).length > 0) {
        await db.from('live_sessions').update({
          egress_sesja_tracks_ids: trackEgressIds,
        }).eq('id', sessionId);
      }
    } catch (e) {
      console.warn('[consent] Failed to start participant egresses:', e);
    }

    console.log(`[consent] Egress started for booking ${bookingId}, session ${sessionId}`);
    return { started: true, reason: 'consent_complete' };
  } catch (e) {
    console.error('[consent] Failed to start Egress:', e);
    await releaseRecordingLock(sessionId);
    return { started: false, reason: 'egress_start_failed' };
  }
}
