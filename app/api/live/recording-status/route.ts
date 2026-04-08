import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { listEgress } from '@/lib/live/livekit';
import { canControlRecording } from '@/lib/live/recording-auth';

/**
 * GET /api/live/recording-status?sessionId=xxx
 *
 * Returns the real-time status of the sesja composite egress for a given session.
 * Used by the staff REC badge in LiveRoom to detect recording failures.
 *
 * Auth: admin OR main staff OR assigned assistant (via staff_members).
 *
 * Returns one of:
 *   - 'active'  — composite egress is running in LiveKit (REC indicator green)
 *   - 'pending' — waiting for consent OR within 20s grace period after session start
 *   - 'error'   — egress is supposed to be running but is not (BRAK NAGRYWANIA)
 *   - 'unknown' — could not verify (LiveKit API timeout/5xx) — show "Sprawdzanie..."
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // Auth: admin OR staff OR assigned assistant
    const allowed = await canControlRecording(user.id, user.email, sessionId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = createSupabaseServiceRole();
    const { data: session } = await db
      .from('live_sessions')
      .select('id, room_name, phase, sesja_started_at, egress_sesja_id, metadata')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ status: 'error' as const });
    }

    // Only sesja phase has recording monitoring (wstep/podsumowanie are short and not user-facing)
    if (session.phase !== 'sesja') {
      return NextResponse.json({ status: 'unknown' as const });
    }

    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const recordingPending = metadata.recording_pending === true;

    // Grace period: LiveKit cold start can take 5-15s
    // If sesja just started and we don't have an egress ID yet, show "pending" not "error"
    const gracePeriodMs = 20_000;
    const sesjaStartedAt = session.sesja_started_at ? new Date(session.sesja_started_at).getTime() : null;
    const withinGracePeriod = sesjaStartedAt !== null && (Date.now() - sesjaStartedAt) < gracePeriodMs;

    // No egress ID yet
    if (!session.egress_sesja_id) {
      if (recordingPending || withinGracePeriod) {
        return NextResponse.json({ status: 'pending' as const });
      }
      return NextResponse.json({ status: 'error' as const });
    }

    // Egress ID exists — verify with LiveKit that it's actually running
    try {
      const egresses = await listEgress(session.room_name);
      // Match by exact egress ID — ignores track egresses (per-participant)
      // which are also active in the same room but different IDs
      const compositeEgress = egresses.find((e) => e.egressId === session.egress_sesja_id);

      if (!compositeEgress) {
        // Egress was started but is no longer active — it crashed
        return NextResponse.json({ status: 'error' as const });
      }

      return NextResponse.json({ status: 'active' as const });
    } catch (err) {
      // LiveKit API timeout/5xx — don't trigger false alarm
      console.warn('[recording-status] LiveKit listEgress failed:', err);
      return NextResponse.json({ status: 'unknown' as const });
    }
  } catch (err) {
    console.error('[recording-status] error:', err);
    return NextResponse.json({ status: 'unknown' as const });
  }
}
