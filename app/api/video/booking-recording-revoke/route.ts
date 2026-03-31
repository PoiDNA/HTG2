import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/video/booking-recording-revoke
 * Self-service revoke — client blocks their own access.
 * For natalia_para: blocks BOTH parties immediately (emergency mechanism).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recordingId } = await request.json();
    if (!recordingId) {
      return NextResponse.json({ error: 'recordingId required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // 1. Check user has access
    const { data: access } = await db
      .from('booking_recording_access')
      .select('id, revoked_at')
      .eq('recording_id', recordingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!access) {
      return NextResponse.json({ error: 'Brak dostępu' }, { status: 403 });
    }

    // 2. Rate limit — already revoked?
    if (access.revoked_at) {
      return NextResponse.json({
        ok: true,
        message: 'Dostęp już został zablokowany.',
      });
    }

    // 3. Get recording details
    const { data: recording } = await db
      .from('booking_recordings')
      .select('id, session_type, booking_id')
      .eq('id', recordingId)
      .single();

    if (!recording) {
      return NextResponse.json({ error: 'Nagranie nie znalezione' }, { status: 404 });
    }

    const isPara = recording.session_type === 'natalia_para';
    const nowIso = new Date().toISOString();

    // 4. Revoke — for para: revoke ALL access rows
    if (isPara) {
      // Revoke all access rows for this recording
      await db
        .from('booking_recording_access')
        .update({
          revoked_at: nowIso,
          revoked_by: user.id,
          revoked_reason: 'self_service',
        })
        .eq('recording_id', recordingId)
        .is('revoked_at', null);

      // Audit — emergency pair revoke
      await db.from('booking_recording_audit').insert({
        recording_id: recordingId,
        action: 'pair_revoke_emergency',
        actor_id: user.id,
        details: {
          initiated_by: user.id,
          booking_id: recording.booking_id,
          reason: 'self_service',
        },
      });

      // TODO: Send emails to both parties (templates: recording_revoke_initiator, recording_revoke_affected)
      // TODO: Create admin task for dispute resolution
      console.log(`[revoke] Pair revoke emergency for recording ${recordingId} by user ${user.id}`);
    } else {
      // Solo: revoke only user's own access
      await db
        .from('booking_recording_access')
        .update({
          revoked_at: nowIso,
          revoked_by: user.id,
          revoked_reason: 'self_service',
        })
        .eq('recording_id', recordingId)
        .eq('user_id', user.id);

      await db.from('booking_recording_audit').insert({
        recording_id: recordingId,
        action: 'access_revoked',
        actor_id: user.id,
        details: { reason: 'self_service' },
      });
    }

    return NextResponse.json({
      ok: true,
      message: isPara
        ? 'Dostęp zablokowany. Nasz zespół skontaktuje się w ciągu 48h.'
        : 'Dostęp do nagrania został cofnięty.',
    });
  } catch (error: unknown) {
    console.error('Revoke error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
