import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/htg-meeting/session/[id]/speaking-event
// Body: { type: 'start' | 'end', ts?: string (ISO) }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, ts } = await req.json();
  if (!['start', 'end'].includes(type)) {
    return NextResponse.json({ error: 'type must be start or end' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const now = ts ? new Date(ts) : new Date();

  // Fetch session to get started_at for offset
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('id, status, started_at')
    .eq('id', sessionId)
    .single();

  if (!session || session.status === 'ended') {
    return NextResponse.json({ ok: true }); // ignore events after session ends
  }

  const offsetSeconds = session.started_at
    ? Math.max(0, (now.getTime() - new Date(session.started_at).getTime()) / 1000)
    : 0;

  if (type === 'start') {
    // Insert new speaking event (leave ended_at null)
    await db.from('htg_speaking_events').insert({
      session_id: sessionId,
      user_id: user.id,
      started_at: now.toISOString(),
      offset_seconds: offsetSeconds,
    });
  } else {
    // Find the most recent open speaking event for this user and close it
    const { data: openEvents } = await db
      .from('htg_speaking_events')
      .select('id, offset_seconds')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (openEvents && openEvents.length > 0) {
      const ev = openEvents[0];
      const duration = offsetSeconds - ev.offset_seconds;
      await db
        .from('htg_speaking_events')
        .update({
          ended_at: now.toISOString(),
          duration_seconds: Math.max(0, duration),
        })
        .eq('id', ev.id);
    }
  }

  return NextResponse.json({ ok: true });
}
