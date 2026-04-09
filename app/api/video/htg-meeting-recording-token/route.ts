import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signHtg2StorageUrl } from '@/lib/bunny';
import { auditHtgRecording } from '@/lib/live/meeting-constants';

/**
 * POST /api/video/htg-meeting-recording-token
 *
 * Mirrors the booking-recording-token pattern but for HTG Meeting composite
 * recordings. Tracks (per-speaker) are admin-only (RLS enforced — this
 * endpoint filters by recording_kind='composite' explicitly, belt & braces).
 *
 * Access checks:
 *  1. Authenticated user
 *  2. Recording exists AND is composite AND status='ready'
 *  3. User has non-revoked row in htg_meeting_recording_access
 *  4. Atomic single-device claim via try_claim_active_stream RPC
 *     (v5 fix #9: INSERT ... ON CONFLICT DO UPDATE ... WHERE ...)
 *  5. Signed URL via signHtg2StorageUrl — fail-closed 503 on missing CDN token key
 *
 * Response (success):
 *   { allowed: true, url, mediaKind: 'audio', deliveryType: 'direct',
 *     mimeType: 'audio/mp4', expiresIn }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recordingId, deviceId } = await request.json();
    if (!recordingId || !deviceId) {
      return NextResponse.json({ error: 'recordingId and deviceId required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // Fetch recording — composite only, must be ready
    const { data: recording } = await db
      .from('htg_meeting_recordings_v2' as any)
      .select('id, recording_kind, backup_storage_path, status, duration_seconds')
      .eq('id', recordingId)
      .maybeSingle();

    const rec = recording as {
      id?: string;
      recording_kind?: string;
      backup_storage_path?: string | null;
      status?: string;
      duration_seconds?: number | null;
    } | null;

    if (!rec) {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Nagranie nie zostało odnalezione.',
      });
    }

    // Tracks blocked — composite only for playback (RLS also enforces this)
    if (rec.recording_kind !== 'composite') {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Ścieżki audio poszczególnych uczestników są dostępne tylko dla administratora.',
      });
    }

    if (rec.status !== 'ready') {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie w przygotowaniu',
        message: rec.status === 'failed'
          ? 'Nagranie nie zostało poprawnie zapisane. Skontaktuj się z administracją.'
          : 'Nagranie jest w trakcie przygotowania. Spróbuj ponownie za kilka minut.',
      });
    }

    if (!rec.backup_storage_path) {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Nagranie nie ma ścieżki w repozytorium. Skontaktuj się z administracją.',
      });
    }

    // Access check — non-revoked row
    const { data: access } = await db
      .from('htg_meeting_recording_access' as any)
      .select('id, revoked_at')
      .eq('recording_id', recordingId)
      .eq('user_id', user.id)
      .maybeSingle();

    const acc = access as { id?: string; revoked_at?: string | null } | null;
    if (!acc || acc.revoked_at) {
      return NextResponse.json({
        allowed: false,
        title: 'Brak dostępu',
        message: 'Nie masz dostępu do tego nagrania lub został on wycofany.',
      });
    }

    // Compute TTL: recording duration + 1h buffer
    const MIN_TTL = 3600; // 1 hour minimum
    const tokenTtl = Math.max(MIN_TTL, (rec.duration_seconds ?? 0) + MIN_TTL);
    const expiresAt = new Date(Date.now() + tokenTtl * 1000).toISOString();

    // Atomic single-device claim via RPC (v5 fix #9).
    // RPC returns id if INSERT or UPDATE succeeded (first device, or same device refresh,
    // or expired claim), empty if another device has an active non-expired claim.
    const { data: claimRows, error: claimError } = await db.rpc(
      'try_claim_active_stream' as any,
      {
        p_recording_id: recordingId,
        p_user_id: user.id,
        p_device_id: deviceId,
        p_expires_at: expiresAt,
      },
    );

    if (claimError) {
      console.error('[htg-token] try_claim_active_stream RPC error:', claimError.message);
      return NextResponse.json({
        allowed: false,
        title: 'Błąd serwera',
        message: 'Nie udało się zarejestrować sesji odtwarzania. Spróbuj ponownie.',
      }, { status: 500 });
    }

    const claimed = Array.isArray(claimRows) ? claimRows.length > 0 : !!claimRows;
    if (!claimed) {
      return NextResponse.json({
        allowed: false,
        title: 'Odtwarzanie na innym urządzeniu',
        message: 'Nagranie jest już odtwarzane na innym urządzeniu. Zatrzymaj tamto odtwarzanie lub poczekaj na wygaśnięcie sesji.',
      }, { status: 409 });
    }

    // Sign URL — fail-closed 503 if CDN token key missing (don't leak existence)
    const signed = signHtg2StorageUrl(rec.backup_storage_path, tokenTtl);
    if (!signed) {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Serwer CDN nie jest skonfigurowany. Skontaktuj się z administracją.',
      }, { status: 503 });
    }

    // Audit successful playback grant
    await auditHtgRecording(db, recordingId, null, 'access_playback', {
      user_id: user.id,
      device_id: deviceId,
      ttl_seconds: tokenTtl,
    });

    return NextResponse.json({
      allowed: true,
      url: signed,
      mediaKind: 'audio' as const,
      deliveryType: 'direct' as const,
      mimeType: 'audio/mp4',
      expiresIn: tokenTtl,
    });
  } catch (error: unknown) {
    console.error('[htg-token] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
