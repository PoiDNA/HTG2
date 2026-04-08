import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/htg-meeting/session/[id]/speaking-event
// Body: { type: 'start' | 'end', ts?: string (ISO) }
//
// Writes to htg_speaking_events with columns defined in migration 018:
//   started_offset_seconds FLOAT NOT NULL
//   ended_offset_seconds   FLOAT NOT NULL
//   display_name           TEXT NOT NULL
//   is_closed              BOOLEAN DEFAULT false  (added in 052)
//
// Previously broken (PR #1 fix — plan v8): schema mismatch with started_at /
// offset_seconds / ended_at / duration_seconds that don't exist.

const BodySchema = z.object({
  type: z.enum(['start', 'end']),
  ts: z.string().datetime({ offset: true }).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 });
  }
  const { type, ts } = body;

  const db = createSupabaseServiceRole();
  const now = ts ? new Date(ts) : new Date();

  // Fetch session — require status='active' (not waiting/ended/free_talk)
  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('id, status, started_at')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status !== 'active') {
    // Silently ignore events outside active window — client may have residual
    // ticking from a phase transition or after end_session.
    return NextResponse.json({ ok: true, ignored: 'session_not_active' });
  }
  if (!session.started_at) {
    return NextResponse.json({ error: 'Session has no started_at' }, { status: 400 });
  }

  const offsetSeconds = Math.max(
    0,
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  // display_name is required by schema — look up from profiles / participants
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const { data: participantRow } = await db
    .from('htg_meeting_participants')
    .select('display_name')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  const displayName =
    participantRow?.display_name ??
    profile?.display_name ??
    profile?.email ??
    user.email ??
    'Uczestnik';

  if (type === 'start') {
    // Check for existing open event. If close in time (<0.5s), treat as
    // continuation — don't close and re-open, which creates artificial
    // micro-segments that pollute D2 scoring.
    const { data: openEvents } = await db
      .from('htg_speaking_events')
      .select('id, started_offset_seconds')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .eq('is_closed', false)
      .order('started_offset_seconds', { ascending: false })
      .limit(1);

    const openEvent = openEvents?.[0];
    if (openEvent && offsetSeconds - openEvent.started_offset_seconds < 0.5) {
      // Continuation: keep the existing event as-is.
      return NextResponse.json({ ok: true, continuation: true });
    }

    if (openEvent) {
      // Legitimate gap — close the old event at current offset, then open a new one.
      await db
        .from('htg_speaking_events')
        .update({
          ended_offset_seconds: offsetSeconds,
          is_closed: true,
        })
        .eq('id', openEvent.id);
    }

    await db.from('htg_speaking_events').insert({
      session_id: sessionId,
      user_id: user.id,
      display_name: displayName,
      started_offset_seconds: offsetSeconds,
      ended_offset_seconds: offsetSeconds, // placeholder — updated on 'end'
      is_closed: false,
    });
  } else {
    // type === 'end' — close the most recent open event for this user.
    const { data: openEvents } = await db
      .from('htg_speaking_events')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .eq('is_closed', false)
      .order('started_offset_seconds', { ascending: false })
      .limit(1);

    if (openEvents && openEvents.length > 0) {
      await db
        .from('htg_speaking_events')
        .update({
          ended_offset_seconds: offsetSeconds,
          is_closed: true,
        })
        .eq('id', openEvents[0].id);
    }
  }

  return NextResponse.json({ ok: true });
}
