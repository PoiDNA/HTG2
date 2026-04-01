import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/recording/update-date
 * Body: { recordingId: string, sessionDate: string }
 * Allows the user to correct the session date on their own recording.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordingId, sessionDate } = await req.json();
  if (!recordingId || !sessionDate) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Verify user has access to this recording
  const { data: access } = await db
    .from('booking_recording_access')
    .select('id')
    .eq('user_id', user.id)
    .eq('recording_id', recordingId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { error } = await db
    .from('booking_recordings')
    .update({ session_date: sessionDate })
    .eq('id', recordingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
