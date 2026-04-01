import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signBunnyUrl, signPrivateCdnUrl } from '@/lib/bunny';

/**
 * POST /api/video/booking-recording-token
 * Returns a signed HLS URL for a booking recording.
 * Checks: auth, blocked, access, para-revoke, status, hybrid retention, concurrent streams.
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

    // 1. Account blocked?
    const { data: profile } = await db
      .from('profiles')
      .select('is_blocked, blocked_reason')
      .eq('id', user.id)
      .single();

    if (profile?.is_blocked) {
      return NextResponse.json({
        allowed: false,
        message: 'Dostęp do materiałów został zawieszony. Skontaktuj się z supportem.',
      });
    }

    // 2. Access check
    const { data: access } = await db
      .from('booking_recording_access')
      .select('id, revoked_at')
      .eq('recording_id', recordingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!access || access.revoked_at) {
      return NextResponse.json({ error: 'Brak dostępu do nagrania' }, { status: 403 });
    }

    // 3. Recording details
    const { data: recording } = await db
      .from('booking_recordings')
      .select('bunny_video_id, bunny_library_id, source_url, status, expires_at, session_type, session_date, legal_hold, duration_seconds')
      .eq('id', recordingId)
      .single();

    if (!recording) {
      return NextResponse.json({ error: 'Nagranie nie znalezione' }, { status: 404 });
    }

    // 4. Para: ANY revoked → block ALL parties
    if (recording.session_type === 'natalia_para') {
      const { data: anyRevoked } = await db
        .from('booking_recording_access')
        .select('id')
        .eq('recording_id', recordingId)
        .not('revoked_at', 'is', null)
        .limit(1)
        .maybeSingle();

      if (anyRevoked) {
        return NextResponse.json({
          allowed: false,
          message: 'Dostęp do nagrania został wstrzymany. Nasz zespół skontaktuje się w ciągu 48h.',
        });
      }
    }

    // 5. Status check
    if (recording.status !== 'ready') {
      return NextResponse.json({
        allowed: false,
        message: recording.status === 'expired'
          ? 'Nagranie wygasło'
          : 'Nagranie jest w trakcie przygotowania. Spróbuj ponownie za kilka minut.',
      });
    }

    // 6. Hybrid retention: MIN(expires_at, session_date + global_policy)
    if (!recording.legal_hold) {
      const now = new Date();

      // Check snapshot expires_at
      if (recording.expires_at && new Date(recording.expires_at) < now) {
        return NextResponse.json({ allowed: false, message: 'Nagranie wygasło' });
      }

      // Check global policy (may be stricter than snapshot)
      if (recording.session_date) {
        const { data: settings } = await db
          .from('site_settings')
          .select('value')
          .eq('key', 'recording_retention_days')
          .maybeSingle();

        const globalDays = settings?.value ? parseInt(settings.value, 10) : 365;
        const globalExpiry = new Date(new Date(recording.session_date).getTime() + globalDays * 86400000);

        if (globalExpiry < now) {
          return NextResponse.json({ allowed: false, message: 'Nagranie wygasło' });
        }
      }
    }

    // 7. Check video availability — supports both Bunny Stream and Storage
    const hasStreamVideo = recording.bunny_video_id && recording.bunny_library_id;
    const hasStorageFile = recording.source_url; // CDN path like "htg-sessions-arch-03-2026/file.m4v"

    if (!hasStreamVideo && !hasStorageFile) {
      return NextResponse.json({ error: 'Video not available' }, { status: 404 });
    }

    // 8. Concurrent streams — separate limit for booking recordings
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: activeStreams } = await supabase
      .from('active_streams')
      .select('device_id')
      .eq('user_id', user.id)
      .not('booking_recording_id', 'is', null)
      .gt('last_heartbeat', cutoff);

    const otherDeviceActive = activeStreams?.some(s => s.device_id !== deviceId);
    if (otherDeviceActive) {
      return NextResponse.json({
        allowed: false,
        message: 'Odtwarzasz już nagranie na innym urządzeniu.',
      });
    }

    // 9. Compute token TTL
    const MIN_TTL = 3600; // 1 hour
    const durationSeconds = (recording as Record<string, unknown>).duration_seconds as number | null;
    const tokenTtl = Math.max(MIN_TTL, (durationSeconds ?? 0) + MIN_TTL);

    // Register stream
    await supabase
      .from('active_streams')
      .upsert({
        user_id: user.id,
        device_id: deviceId,
        booking_recording_id: recordingId,
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: 'user_id,device_id' });

    // 10. Sign URL — Bunny Stream (HLS) or Private CDN (direct file)
    let url: string;
    if (hasStreamVideo) {
      url = signBunnyUrl(recording.bunny_video_id!, recording.bunny_library_id!, tokenTtl);
    } else {
      url = signPrivateCdnUrl(recording.source_url!, tokenTtl);
    }

    return NextResponse.json({
      allowed: true,
      url,
      expiresIn: tokenTtl,
    });
  } catch (error: unknown) {
    console.error('Booking recording token error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
