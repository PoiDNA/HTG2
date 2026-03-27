import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import { VALID_TRANSITIONS } from '@/lib/live/constants';
import { startRoomCompositeEgress, startParticipantEgress, stopEgress } from '@/lib/live/livekit';
import type { Phase, PhaseChangeRequest } from '@/lib/live/types';

// GET — poll current phase
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

    // Phase-specific actions
    try {
      // Stop recording from previous phase
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

      // Start recording for new phase
      if (newPhase === 'wstep') {
        update.started_at = new Date().toISOString();
        try {
          const egress = await startRoomCompositeEgress(session.room_name);
          update.egress_wstep_id = egress.egressId;
        } catch (e) {
          console.warn('Failed to start wstep egress:', e);
        }
      }

      if (newPhase === 'sesja') {
        // Start composite MP4 for client
        try {
          const egress = await startRoomCompositeEgress(session.room_name, { audioOnly: true });
          update.egress_sesja_id = egress.egressId;
        } catch (e) {
          console.warn('Failed to start sesja composite egress:', e);
        }
        // Individual track egresses would be started here
        // (requires knowing participant identities from LiveKit room)
      }

      if (newPhase === 'podsumowanie') {
        try {
          const egress = await startRoomCompositeEgress(session.room_name);
          update.egress_podsumowanie_id = egress.egressId;
        } catch (e) {
          console.warn('Failed to start podsumowanie egress:', e);
        }
      }

      if (newPhase === 'ended') {
        update.ended_at = new Date().toISOString();
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
