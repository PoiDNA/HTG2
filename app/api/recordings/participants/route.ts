import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { resolveStaffPlaybackScope, isSessionTypeInScope } from '@/lib/admin/require-playback-actor';
import { checkRateLimit, logRateLimitAction } from '@/lib/rate-limit/check';

/**
 * GET /api/recordings/participants?id=<recordingId>
 *
 * Zwraca listę obecnych uczestników (aktywnych + revoked) dla nagrania fazy sesja,
 * do wyświetlenia w modalu "Przydziel nagranie" na /admin/sesje + /prowadzacy/sesje.
 *
 * Auth: admin, practitioner, lub assistant w scope.
 * Walidacja: tylko recording_phase='sesja' AND status='ready'.
 *
 * Rate limit: 60 requests / 60 min per user (slot-reservation semantics).
 * HARD INVARIANT: rate check + log MUST run before the recording fetch,
 * before the `if (!recordingId)` 400 short-circuit, and before the
 * `isSessionTypeInScope` check. Otherwise an assistant can enumerate
 * random UUIDs by catching 404/403 without burning slots.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const scope = await resolveStaffPlaybackScope(user, db);
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rateLimited = await checkRateLimit(user.id, 'recordings_participants');
  if (rateLimited) {
    return NextResponse.json(
      { error: 'Zbyt wiele żądań. Spróbuj za chwilę.' },
      { status: 429 },
    );
  }
  // Slot-reservation: log immediately. Every 4xx response below still burns
  // a slot — that's the anti-enumeration point.
  await logRateLimitAction(user.id, 'recordings_participants');

  const recordingId = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!recordingId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Fetch recording + validate phase/status/scope
  const { data: recording } = await db
    .from('booking_recordings')
    .select('id, session_type, recording_phase, status')
    .eq('id', recordingId)
    .maybeSingle();

  if (!recording) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (recording.recording_phase !== 'sesja' || recording.status !== 'ready') {
    return NextResponse.json({ error: 'Recording not available' }, { status: 400 });
  }

  if (!isSessionTypeInScope(scope, recording.session_type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch access rows + join profiles
  const { data: accessRows } = await db
    .from('booking_recording_access')
    .select('user_id, revoked_at, granted_reason')
    .eq('recording_id', recordingId)
    .order('granted_at', { ascending: true })
    .limit(50);

  const userIds = [...new Set((accessRows || []).map(r => r.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  const participants = (accessRows || []).map(row => {
    const profile = profileMap.get(row.user_id);
    return {
      user_id: row.user_id,
      email: profile?.email ?? null,
      display_name: profile?.display_name ?? null,
      revoked: row.revoked_at !== null,
      granted_reason: row.granted_reason,
    };
  });

  return NextResponse.json({ participants });
}
