import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

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

    const { playEventId, sessionId, positionSeconds, totalDurationSeconds } = await request.json();
    if (!sessionId || positionSeconds == null) return NextResponse.json({ ok: true });

    const db = createSupabaseServiceRole();
    await db.from('playback_positions').insert({
      play_event_id: playEventId || null,
      session_id: sessionId,
      position_seconds: Math.floor(positionSeconds),
      total_duration_seconds: totalDurationSeconds ? Math.floor(totalDurationSeconds) : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // analytics failures are non-blocking
  }
}
