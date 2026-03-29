import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';
import { VALID_TRANSITIONS } from '@/lib/live/constants';
import { startRoomCompositeEgress, startParticipantEgress, stopEgress } from '@/lib/live/livekit';
import type { Phase, PhaseChangeRequest } from '@/lib/live/types';

// GET — poll current phase
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const admin = createSupabaseServiceRole();
    const { data } = await admin.from('live_sessions').select('phase').eq('id', sessionId).single();
    return NextResponse.json({ phase: data?.phase || 'ended' });
  } catch {
    return NextResponse.json({ phase: 'ended' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createSupabaseServiceRole();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const { sessionId, newPhase } = (await request.json()) as PhaseChangeRequest;

    if (!sessionId || !newPhase) {
      return NextResponse.json({ error: 'sessionId and newPhase required' }, { status: 400 });
    }

    // Fetch current session
    const { data: session, error: fetchError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const currentPhase = session.phase as Phase;

    // Validate transition
    const expectedNext = VALID_TRANSITIONS[currentPhase];
    if (newPhase !== expectedNext) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentPhase} → ${newPhase}. Expected: ${expectedNext}` },
        { status: 400 },
      );
    }

    // Prepare update payload
    const update: Record<string, unknown> = {
      phase: newPhase,
      phase_changed_at: new Date().toISOString(),
    };

    const now = new Date();
    const nowIso = now.toISOString();

    // ── Phase timer helpers ─────────────────────────────────────────────────
    function secsBetween(from: string | null, to: Date): number | null {
      if (!from) return null;
      return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 1000));
    }

    // Phase-specific actions
    try {
      // Stop recording from previous phase + compute phase durations
      if (currentPhase === 'wstep' && session.egress_wstep_id) {
        await stopEgress(session.egress_wstep_id);
      }
      if (currentPhase === 'sesja') {
        if (session.egress_sesja_id) {
          await stopEgress(session.egress_sesja_id);
        }
        // Stop individual track egresses
        if (session.egress_sesja_tracks_ids) {
          const trackIds = session.egress_sesja_tracks_ids as Record<string, string>;
          for (const egressId of Object.values(trackIds)) {
            await stopEgress(egressId);
          }
        }
      }
      if (currentPhase === 'podsumowanie' && session.egress_podsumowanie_id) {
        await stopEgress(session.egress_podsumowanie_id);
      }

      // ── Save phase end timestamps / durations ─────────────────────────────
      if (newPhase === 'przejscie_1') {
        // Wstep ended — compute wstep duration
        const dur = secsBetween(session.started_at, now);
        if (dur !== null) update.wstep_duration_seconds = dur;
      }
      if (newPhase === 'przejscie_2') {
        // Sesja ended — compute sesja duration
        const dur = secsBetween(session.sesja_started_at, now);
        if (dur !== null) update.sesja_duration_seconds = dur;
      }
      if (newPhase === 'outro') {
        // Podsumowanie ended — compute podsumowanie duration
        const dur = secsBetween(session.podsumowanie_started_at, now);
        if (dur !== null) update.podsumowanie_duration_seconds = dur;
      }

      // Start recording for new phase + set phase start timestamps
      if (newPhase === 'wstep') {
        update.started_at = nowIso;
        try {
          const egress = await startRoomCompositeEgress(session.room_name);
          update.egress_wstep_id = egress.egressId;
        } catch (e) {
          console.warn('Failed to start wstep egress:', e);
        }
      }

      if (newPhase === 'sesja') {
        update.sesja_started_at = nowIso;
        try {
          // Start composite audio for the room (mixed, for client playback)
          const compositeEgress = await startRoomCompositeEgress(session.room_name, { audioOnly: true });
          update.egress_sesja_id = compositeEgress.egressId;
        } catch (e) {
          console.warn('Failed to start sesja composite egress:', e);
        }

        // Start per-participant track egresses
        try {
          const { listRoomParticipants, startParticipantEgress } = await import('@/lib/live/livekit');
          const participants = await listRoomParticipants(session.room_name);
          const trackEgressIds: Record<string, string> = {};

          for (const participant of participants) {
            if (!participant.identity) continue;
            try {
              const egress = await startParticipantEgress(session.room_name, participant.identity);
              trackEgressIds[participant.identity] = egress.egressId;
            } catch (e) {
              console.warn(`Failed to start track egress for ${participant.identity}:`, e);
            }
          }

          if (Object.keys(trackEgressIds).length > 0) {
            update.egress_sesja_tracks_ids = trackEgressIds;
          }
        } catch (e) {
          console.warn('Failed to start participant egresses:', e);
        }
      }

      if (newPhase === 'podsumowanie') {
        update.podsumowanie_started_at = nowIso;
        try {
          const egress = await startRoomCompositeEgress(session.room_name);
          update.egress_podsumowanie_id = egress.egressId;
        } catch (e) {
          console.warn('Failed to start podsumowanie egress:', e);
        }
      }

      if (newPhase === 'ended') {
        update.ended_at = nowIso;
        const totalDur = secsBetween(session.started_at, now);
        if (totalDur !== null) update.total_duration_seconds = totalDur;

        // Auto-settle: trigger transfer to assistant after session ends
        try {
          const { SESSION_PAYOUT_CONFIG } = await import('@/lib/stripe-connect');
          const config = SESSION_PAYOUT_CONFIG[session.session_type || ''];

          // Get booking to find payment info
          const { data: booking } = await admin
            .from('bookings')
            .select('id, session_type, order_id')
            .eq('id', session.booking_id)
            .single();

          if (booking && config) {
            // Find assistant for this session
            const { data: slot } = await admin
              .from('booking_slots')
              .select('assistant_id')
              .eq('id', session.slot_id)
              .single();

            const idempotencyKey = `settle-${booking.id}-${Date.now()}`;

            // Create settlement record
            await admin.from('session_settlements').insert({
              booking_id: booking.id,
              live_session_id: sessionId,
              payment_intent_id: booking.order_id || 'manual',
              total_amount: config.totalAmount,
              currency: 'pln',
              platform_amount: config.platformAmount,
              assistant_amount: config.assistantAmount,
              assistant_staff_id: slot?.assistant_id || null,
              session_type: booking.session_type,
              idempotency_key: idempotencyKey,
              status: 'session_completed',
              transfer_status: config.assistantAmount === 0 ? 'not_applicable' : 'pending',
            });

            // If assistant amount > 0, auto-trigger settlement
            if (config.assistantAmount > 0 && slot?.assistant_id) {
              // Fire and forget — settle endpoint will handle
              fetch(new URL('/api/stripe/settle', request.url).href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
                body: JSON.stringify({ bookingId: booking.id }),
              }).catch(e => console.warn('Auto-settle failed:', e));
            } else {
              // Solo session — mark as settled immediately
              await admin.from('session_settlements').update({
                status: 'settled',
              }).eq('idempotency_key', idempotencyKey);
            }
          }
        } catch (settleErr) {
          console.warn('Auto-settle creation failed (non-blocking):', settleErr);
        }
      }
    } catch (egressError) {
      console.warn('Egress operation failed (non-blocking):', egressError);
    }

    // Update database
    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update(update)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ session: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Phase change error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
