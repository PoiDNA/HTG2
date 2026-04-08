import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import { startRoomCompositeEgress, stopEgress } from '@/lib/live/livekit';
import { startAllAnalyticsAudioTrackEgresses } from '@/lib/live/analytics-egress';
import type { AdmitRequest } from '@/lib/live/types';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const { sessionId } = (await request.json()) as AdmitRequest;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Use service role to bypass RLS, because staff members update the session state,
    // which may not be fully accessible for writes without service role depending on RLS.
    // The security is guaranteed by `isStaffEmail` above.
    const admin = createSupabaseServiceRole();

    // Fetch session — must be in poczekalnia phase.
    // SELECT extended with: room_name, booking_id, egress_wstep_id, analytics_wstep_claimed_at
    // for composite idempotency guard and analytics claim.
    const { data: session, error: fetchError } = await admin
      .from('live_sessions')
      .select('phase, room_name, booking_id, egress_wstep_id, analytics_wstep_claimed_at')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.phase !== 'poczekalnia') {
      return NextResponse.json(
        { error: `Cannot admit: session is in phase "${session.phase}", expected "poczekalnia"` },
        { status: 400 },
      );
    }

    // Transition to wstep
    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({
        phase: 'wstep',
        phase_changed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // ── Start composite egress for Wstęp ─────────────────────────────────
    // Previously this was in phase/route.ts (dead code — never reached, because
    // PhaseControls calls /api/live/admit for poczekalnia→wstep transition).
    // Idempotency: only start if no existing egress_wstep_id; atomic UPDATE
    // with IS NULL guard handles double-tap by stopping the loser's egress.
    if (!session.egress_wstep_id) {
      try {
        const egress = await startRoomCompositeEgress(session.room_name);
        const { data: stored } = await admin
          .from('live_sessions')
          .update({ egress_wstep_id: egress.egressId })
          .eq('id', sessionId)
          .is('egress_wstep_id', null)
          .select('id')
          .maybeSingle();

        if (!stored) {
          // Lost the race — another concurrent admit already set egress_wstep_id.
          // Stop our orphaned egress to avoid double LiveKit cost.
          console.warn(`[admit] lost race for wstep composite, stopping orphan ${egress.egressId}`);
          await stopEgress(egress.egressId).catch(() => {});
        }
      } catch (e) {
        console.warn('[admit] Failed to start wstep composite egress:', e);
      }
    }

    // ── Analytics track egresses for Wstęp ───────────────────────────────
    // Only start if consent is already complete (rare at wstep start — consent
    // is typically collected during wstep, which triggers retroactive start via
    // consent/route.ts). Atomic claim via analytics_wstep_claimed_at prevents
    // race with concurrent consent submissions.
    if (!session.analytics_wstep_claimed_at) {
      const { data: consentOk } = await admin.rpc('check_analytics_consent', {
        p_booking_id: session.booking_id,
      });
      if (consentOk === true) {
        const { data: claim } = await admin
          .from('live_sessions')
          .update({ analytics_wstep_claimed_at: new Date().toISOString() })
          .eq('id', sessionId)
          .is('analytics_wstep_claimed_at', null)
          .select('id')
          .maybeSingle();

        if (claim) {
          try {
            await startAllAnalyticsAudioTrackEgresses(
              admin,
              session.room_name,
              'wstep',
              sessionId,
            );
          } catch (e) {
            // Reset claim on failure so subsequent requests (e.g. from consent) can retry.
            console.warn('[admit] wstep analytics failed, resetting claim:', e);
            await admin
              .from('live_sessions')
              .update({ analytics_wstep_claimed_at: null })
              .eq('id', sessionId);
          }
        }
      }
    }

    return NextResponse.json({ session: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
