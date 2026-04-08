import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/video/play-position?sessionId=xxx
 * Returns the last saved playback position for a session.
 * Used to resume playback from where the user left off.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ position: 0 });

    const sessionId = request.nextUrl.searchParams.get('sessionId')
      ?? request.nextUrl.searchParams.get('recordingId');
    if (!sessionId) return NextResponse.json({ position: 0 });

    const db = createSupabaseServiceRole();
    const { data } = await db
      .from('playback_positions')
      .select('position_seconds, total_duration_seconds')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) return NextResponse.json({ position: 0 });

    // Don't resume if within last 5 seconds of total duration (treat as completed)
    if (data.total_duration_seconds && data.position_seconds >= data.total_duration_seconds - 5) {
      return NextResponse.json({ position: 0 });
    }

    // Don't resume if less than 10 seconds in (not worth it)
    if (data.position_seconds < 10) {
      return NextResponse.json({ position: 0 });
    }

    return NextResponse.json({ position: data.position_seconds });
  } catch {
    return NextResponse.json({ position: 0 });
  }
}

/**
 * POST /api/video/play-position
 * Called every 30s by VideoPlayer to record current playback position.
 * Powers the retention/engagement graph in admin analytics.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ ok: true }); // silently ignore for unauth

    const body = await request.json();
    const sessionId = body.sessionId ?? body.recordingId;
    const { playEventId, positionSeconds, totalDurationSeconds } = body;
    if (!sessionId || positionSeconds == null) return NextResponse.json({ ok: true });

    const db = createSupabaseServiceRole();
    await db.from('playback_positions').insert({
      play_event_id: playEventId || null,
      session_id: sessionId,
      user_id: user.id,
      position_seconds: Math.floor(positionSeconds),
      total_duration_seconds: totalDurationSeconds ? Math.floor(totalDurationSeconds) : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // analytics failures are non-blocking
  }
}
