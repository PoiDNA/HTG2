import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/analytics/recording-play
 * Body: { action: 'start'|'stop', recordingId, eventId?, durationSeconds? }
 * Tracks plays for client recordings (nagrania przed/po).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ ok: true });

    const { action, recordingId, eventId, durationSeconds } = await request.json();
    const db = createSupabaseServiceRole();

    if (action === 'stop' && eventId) {
      await db.from('recording_play_events')
        .update({ ended_at: new Date().toISOString(), play_duration_seconds: durationSeconds ?? null })
        .eq('id', eventId)
        .eq('user_id', user.id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'start' && recordingId) {
      const { data } = await db.from('recording_play_events').insert({
        user_id: user.id,
        recording_id: recordingId,
        started_at: new Date().toISOString(),
      }).select('id').single();
      return NextResponse.json({ eventId: data?.id });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
