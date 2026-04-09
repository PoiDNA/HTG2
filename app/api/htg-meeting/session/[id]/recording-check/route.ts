import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/htg-meeting/session/[id]/recording-check
 *
 * Check whether a composite recording exists and is playable for this session.
 * Used by MeetingRoom.tsx on session end to decide whether to redirect to
 * the playback page.
 *
 * After PR #7 / migration 055: queries htg_meeting_recordings_v2 instead of
 * the dropped htg_meeting_recordings. Only composite + ready → exists: true
 * (tracks are admin-only, still-queued recordings are not playable yet).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ exists: false });

  const db = createSupabaseServiceRole();
  const { data } = await db
    .from('htg_meeting_recordings_v2' as any)
    .select('id')
    .eq('meeting_session_id', sessionId)
    .eq('recording_kind', 'composite')
    .eq('status', 'ready')
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
