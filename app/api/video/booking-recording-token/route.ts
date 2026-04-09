import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signBunnyUrl, signPrivateCdnUrl, signHtg2StorageUrl } from '@/lib/bunny';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { resolveStaffPlaybackScope, isSessionTypeInScope } from '@/lib/admin/require-playback-actor';
import { checkRateLimit, logRateLimitAction } from '@/lib/rate-limit/check';

/**
 * POST /api/video/booking-recording-token
 * Returns a signed playback URL for a booking recording.
 * Checks: auth, blocked, access, para-revoke, status, hybrid retention, concurrent streams.
 * Supports admin impersonation via IMPERSONATE_USER_COOKIE.
 *
 * Response includes:
 *   - mediaKind: 'audio' | 'video' — type of medium
 *   - deliveryType: 'hls' | 'direct' — transport mechanism
 *   - mimeType: string | null — MIME type for direct files (null for HLS)
 *
 * Rate limit: 60 requests / 60 min per user (slot-reservation semantics).
 *   HARD INVARIANT: rate check + log MUST run immediately after `getUser()`
 *   returns a user, BEFORE body parsing, `profiles.is_blocked` query, or any
 *   other DB work. The only early return allowed before the rate check is
 *   401 Unauthorized (no user → no userId to log against). All other early
 *   returns (400 body validation, `allowed: false` responses) happen AFTER
 *   the slot is allocated — this is the anti-enumeration invariant from the
 *   slot-reservation pattern in lib/rate-limit/check.ts.
 *
 *   Limit is pinned to `user.id` (session subject), NOT `effectiveUserId`
 *   (impersonation target). Admin impersonating a client does not burn the
 *   client's slot.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit — slot-reservation BEFORE any work. Includes body parsing
    // and `profiles.is_blocked` lookup. See JSDoc above for invariant.
    const rateLimited = await checkRateLimit(user.id, 'booking_recording_token');
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Zbyt wiele żądań. Spróbuj za chwilę.' },
        { status: 429 },
      );
    }
    await logRateLimitAction(user.id, 'booking_recording_token');

    const { recordingId, deviceId } = await request.json();
    if (!recordingId || !deviceId) {
      return NextResponse.json({ error: 'recordingId and deviceId required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // Admin impersonation: use impersonated user's ID for access checks
    let effectiveUserId = user.id;
    const impersonateId = request.cookies.get(IMPERSONATE_USER_COOKIE)?.value;
    if (impersonateId && isAdminEmail(user.email ?? '')) {
      effectiveUserId = impersonateId;
    }

    // 1. Account blocked?
    const { data: profile } = await db
      .from('profiles')
      .select('is_blocked, blocked_reason')
      .eq('id', effectiveUserId)
      .single();

    if (profile?.is_blocked) {
      return NextResponse.json({
        allowed: false,
        title: 'Konto zablokowane',
        message: 'Dostęp do materiałów został zawieszony. Skontaktuj się z supportem.',
      });
    }

    // 2. Recording details (fetched FIRST so we can check recording_phase before access check)
    const { data: recording } = await db
      .from('booking_recordings')
      .select('bunny_video_id, bunny_library_id, backup_storage_path, source_url, status, expires_at, session_type, session_date, legal_hold, duration_seconds, recording_phase')
      .eq('id', recordingId)
      .single();

    if (!recording) {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Nagranie nie zostało odnalezione w systemie.',
      });
    }

    const recordingPhase = (recording as Record<string, unknown>).recording_phase as string | null;
    const isNonSesja = recordingPhase && recordingPhase !== 'sesja';

    // Staff/admin bypass scope resolution.
    // Impersonation DISABLES bypass: admin impersonating a client acts as that client
    // and goes through the normal access check on effectiveUserId. Intentional.
    const scope = impersonateId ? null : await resolveStaffPlaybackScope(user, db);

    // 3. Phase guard: non-sesja recordings (wstep/podsumowanie) are admin-only.
    // Direct admin (without impersonation) can access; impersonating admin acts as client.
    const isDirectAdmin = isAdminEmail(user.email ?? '') && !impersonateId;
    if (isNonSesja) {
      if (!isDirectAdmin) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'To nagranie nie jest dostępne dla użytkowników.',
        });
      }
      // Direct admin: skip access check entirely (admin-only material has no access rows)
    } else {
      // 4. Access check (sesja only) — staff/admin in scope bypass the access-row requirement
      const hasStaffBypass = isSessionTypeInScope(scope, recording.session_type);

      if (!hasStaffBypass) {
        const { data: access } = await db
          .from('booking_recording_access')
          .select('id, revoked_at')
          .eq('recording_id', recordingId)
          .eq('user_id', effectiveUserId)
          .maybeSingle();

        if (!access || access.revoked_at) {
          return NextResponse.json({
            allowed: false,
            title: 'Brak dostępu',
            message: 'Nie masz dostępu do tego nagrania.',
          });
        }
      }
    }

    // 4. Para: PARTNER-initiated revoke blocks ALL parties (including admin/staff preview).
    // Filter by granted_reason so admin-initiated removes of preset share rows
    // (granted_reason='admin_grant') don't trigger the para lockout.
    // 'booking_client' + 'companion' are the partner consent relationships.
    // 'import_match' and 'admin_grant' revokes are NOT partner consent events.
    if (recording.session_type === 'natalia_para') {
      const { data: partnerRevoked } = await db
        .from('booking_recording_access')
        .select('id')
        .eq('recording_id', recordingId)
        .not('revoked_at', 'is', null)
        .in('granted_reason', ['booking_client', 'companion'])
        .limit(1)
        .maybeSingle();

      if (partnerRevoked) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Dostęp do nagrania został wstrzymany. Nasz zespół skontaktuje się w ciągu 48h.',
          supportContact: 'htg@htg.cyou',
        });
      }
    }

    // 5. Status check
    // Note: backup is in Bunny Storage (warm DR, not hot replica). No automatic
    // failover here — if primary fails, admin manually recovers from Bunny panel.
    if (recording.status !== 'ready') {
      return NextResponse.json({
        allowed: false,
        title: recording.status === 'expired' ? 'Nagranie wygasło' : 'Nagranie w przygotowaniu',
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
        return NextResponse.json({ allowed: false, title: 'Nagranie wygasło', message: 'Nagranie wygasło' });
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
          return NextResponse.json({ allowed: false, title: 'Nagranie wygasło', message: 'Nagranie wygasło' });
        }
      }
    }

    // 7. Check recording availability — 3 possible sources (priority order):
    //   a) backup_storage_path → HTG2 primary (Bunny Storage via HTG2 Pull Zone)
    //   b) bunny_video_id      → legacy HTG Stream imports (historical)
    //   c) source_url          → legacy private CDN (pre-HTG2 archival imports)
    const backupStoragePath = (recording as Record<string, unknown>).backup_storage_path as string | null;
    const hasHtg2Storage = !!backupStoragePath;
    const hasStreamVideo = recording.bunny_video_id && recording.bunny_library_id;
    const hasLegacySource = recording.source_url;

    if (!hasHtg2Storage && !hasStreamVideo && !hasLegacySource) {
      return NextResponse.json({
        allowed: false,
        title: 'Nagranie niedostępne',
        message: 'Nagranie nie jest jeszcze gotowe lub zostało przeniesione do archiwum offline.',
        supportContact: 'htg@htg.cyou',
      });
    }

    // 8. Concurrent streams — separate limit for booking recordings
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: activeStreams } = await db
      .from('active_streams')
      .select('device_id')
      .eq('user_id', effectiveUserId)
      .not('booking_recording_id', 'is', null)
      .gt('last_heartbeat', cutoff);

    const otherDeviceActive = activeStreams?.some(s => s.device_id !== deviceId);
    if (otherDeviceActive) {
      return NextResponse.json({
        allowed: false,
        title: 'Odtwarzanie na innym urządzeniu',
        message: 'Odtwarzasz już nagranie na innym urządzeniu.',
      });
    }

    // 9. Compute token TTL
    const MIN_TTL = 3600; // 1 hour
    const durationSeconds = (recording as Record<string, unknown>).duration_seconds as number | null;
    const tokenTtl = Math.max(MIN_TTL, (durationSeconds ?? 0) + MIN_TTL);

    // Register stream (service role — bypasses RLS)
    await db
      .from('active_streams')
      .upsert({
        user_id: effectiveUserId,
        device_id: deviceId,
        booking_recording_id: recordingId,
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: 'user_id,device_id' });

    // 10. Sign URL — HTG2 Storage (preferred), legacy Stream, or legacy Private CDN
    let url: string;
    let deliveryType: 'hls' | 'direct';
    let pathForMimeDetection: string | null = null;

    if (hasHtg2Storage) {
      // HTG2 primary: signed URL via dedicated HTG2 Pull Zone
      const signed = signHtg2StorageUrl(backupStoragePath!, tokenTtl);
      if (!signed) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Serwer CDN nie jest skonfigurowany. Skontaktuj się z administracją.',
          supportContact: 'htg@htg.cyou',
        });
      }
      url = signed;
      deliveryType = 'direct';
      pathForMimeDetection = backupStoragePath;
    } else if (hasStreamVideo) {
      // Legacy HTG: Bunny Stream HLS playback
      url = signBunnyUrl(recording.bunny_video_id!, recording.bunny_library_id!, tokenTtl);
      deliveryType = 'hls';
    } else {
      // Legacy private CDN: direct file (pre-HTG2 archival imports)
      url = signPrivateCdnUrl(recording.source_url!, tokenTtl);
      deliveryType = 'direct';
      pathForMimeDetection = recording.source_url!;
    }

    // Guess MIME type from file extension (direct only; HLS has its own manifest)
    let mimeType: string | null = null;
    if (deliveryType === 'direct' && pathForMimeDetection) {
      const ext = pathForMimeDetection.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'm4a': 'audio/mp4',
        'mp3': 'audio/mpeg',
        'ogg': 'audio/ogg',
        'wav': 'audio/wav',
        'aac': 'audio/aac',
        'webm': 'audio/webm',
        'mp4': 'audio/mp4',    // HTG2 sesja is audio-only composite MP4 — use audio MIME
        'm4v': 'video/mp4',
        'mov': 'video/quicktime',
      };
      mimeType = (ext && mimeMap[ext]) ?? null;
    }

    // mediaKind: sesja is audio (composite audio egress), wstep/podsumowanie are video.
    // Frontend player must handle both — but admin-only views can show video for non-sesja.
    const mediaKind = isNonSesja ? 'video' as const : 'audio' as const;

    return NextResponse.json({
      allowed: true,
      url,
      mediaKind,
      deliveryType,
      mimeType,
      expiresIn: tokenTtl,
    });
  } catch (error: unknown) {
    console.error('Booking recording token error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
