import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { checkRateLimit, logRateLimitAction } from '@/lib/rate-limit/check';
import { userHasFragmentAccess } from '@/lib/access/fragment-access';
import { userHasSessionAccess } from '@/lib/access/session-access';
import { checkRecordingAccess } from '@/lib/access/recording-access';
import { signMedia, computeTokenTtl } from '@/lib/media-signing';

/**
 * POST /api/video/fragment-token
 *
 * Returns a signed playback URL for a fragment save or impulse fragment.
 * Two identity paths (XOR):
 *   A. { saveId, deviceId, radio? }     — saved fragment (predefined or custom)
 *   B. { sessionFragmentId, deviceId }  — impulse fragment (is_impulse=true only)
 *
 * Access gates:
 *   1. Fragment feature gate (userHasFragmentAccess) — admin bypasses
 *   2. Source media access:
 *      - VOD (session_template_id): userHasSessionAccess — admin bypasses
 *      - Recording (booking_recording_id): checkRecordingAccess — full recording checks
 *
 * Rate limit invariant (anti-enumeration):
 *   checkRateLimit + logRateLimitAction run IMMEDIATELY after getUser(),
 *   BEFORE blocked check, body parse, or any other work.
 *   Pinned to user.id (NOT effectiveUserId).
 *
 * Response:
 *   { allowed, url, deliveryType, mimeType, expiresIn, startSec, endSec }
 *   startSec/endSec: fragment playback range (client seeks + stops AudioEngine)
 *   session_type in play_events: fragment_review | fragment_radio | fragment_recording_review
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: HARD INVARIANT — must run before any other work ───────
    const rateLimited = await checkRateLimit(user.id, 'fragment_token');
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Zbyt wiele żądań. Spróbuj za chwilę.' },
        { status: 429 },
      );
    }
    await logRateLimitAction(user.id, 'fragment_token');

    // ── Impersonation + admin context ────────────────────────────────────
    const impersonateId = request.cookies.get(IMPERSONATE_USER_COOKIE)?.value;
    const isAdmin = isAdminEmail(user.email ?? '');
    const isImpersonating = !!(impersonateId && isAdmin);
    const effectiveUserId = isImpersonating ? impersonateId : user.id;
    const isDirectAdmin = isAdmin && !isImpersonating;

    const db = createSupabaseServiceRole();

    // ── Blocked check ─────────────────────────────────────────────────────
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

    // ── Parse body ────────────────────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { saveId, sessionFragmentId, deviceId, radio = false } = body as {
      saveId?: string;
      sessionFragmentId?: string;
      deviceId?: string;
      radio?: boolean;
    };

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
    }
    if (!saveId && !sessionFragmentId) {
      return NextResponse.json({ error: 'saveId or sessionFragmentId required' }, { status: 400 });
    }
    if (saveId && sessionFragmentId) {
      return NextResponse.json({ error: 'Provide saveId OR sessionFragmentId, not both' }, { status: 400 });
    }
    // shareToken is forbidden in the sessionFragmentId (impulse) path
    if (sessionFragmentId && body.shareToken) {
      return NextResponse.json({ error: 'shareToken not allowed for impulse playback' }, { status: 400 });
    }

    // ── Fragment feature gate ─────────────────────────────────────────────
    if (!isAdmin) {
      const hasFragmentAccess = await userHasFragmentAccess(effectiveUserId, db);
      if (!hasFragmentAccess) {
        return NextResponse.json({
          allowed: false,
          title: 'Brak dostępu do fragmentów',
          message: 'Dostęp do fragmentów wymaga aktywnej subskrypcji.',
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PATH B: Impulse (sessionFragmentId — is_impulse=true only)
    // ────────────────────────────────────────────────────────────────────────
    if (sessionFragmentId) {
      const { data: fragment } = await db
        .from('session_fragments')
        .select(`
          id, start_sec, end_sec, session_template_id, is_impulse,
          session_templates!inner(id, is_published, bunny_video_id, bunny_library_id, title, media_version)
        `)
        .eq('id', sessionFragmentId)
        .eq('is_impulse', true)
        .single();

      if (!fragment) {
        return NextResponse.json({
          allowed: false,
          title: 'Fragment niedostępny',
          message: 'Impuls nie istnieje lub nie jest dostępny.',
        });
      }

      const st = (fragment as any).session_templates;

      // Non-admin requires published session
      if (!isAdmin && !st.is_published) {
        return NextResponse.json({
          allowed: false,
          title: 'Sesja niedostępna',
          message: 'Źródłowa sesja nie jest opublikowana.',
        });
      }

      // VOD session access (admin bypasses)
      if (!isAdmin) {
        const hasSessionAccess = await userHasSessionAccess(effectiveUserId, fragment.session_template_id, db);
        if (!hasSessionAccess) {
          return NextResponse.json({
            allowed: false,
            title: 'Brak dostępu do sesji',
            message: 'Nie masz aktywnego dostępu do tej sesji.',
          });
        }
      }

      // Sign media
      const signed = signMedia({
        bunny_video_id: st.bunny_video_id,
        bunny_library_id: st.bunny_library_id,
        backup_storage_path: null,
        media_version: (st.media_version as number | null) ?? 0,
      }, 3600);

      if (!signed) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Plik nagrania nie został odnaleziony.',
        });
      }

      // Register stream (admin skips, like video/token)
      if (!isAdmin) {
        await db.from('active_streams').upsert({
          user_id: effectiveUserId,
          device_id: deviceId,
          session_id: fragment.session_template_id,
          stream_context: 'fragment_review',
          last_heartbeat: new Date().toISOString(),
        }, { onConflict: 'user_id,device_id' });
      }

      return NextResponse.json({
        allowed: true,
        url: signed.url,
        deliveryType: signed.deliveryType,
        mimeType: signed.mimeType,
        expiresIn: 3600,
        startSec: fragment.start_sec,
        endSec: fragment.end_sec,
        sessionType: 'fragment_review',
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // PATH A: Save-based (saveId)
    // ────────────────────────────────────────────────────────────────────────
    const { data: save } = await db
      .from('user_fragment_saves')
      .select('id, user_id, session_template_id, booking_recording_id, fragment_type, session_fragment_id, fallback_start_sec, fallback_end_sec, custom_start_sec, custom_end_sec')
      .eq('id', saveId!)
      .eq('user_id', effectiveUserId)
      .single();

    if (!save) {
      return NextResponse.json({
        allowed: false,
        title: 'Fragment niedostępny',
        message: 'Zapisany fragment nie istnieje lub nie należy do Ciebie.',
      });
    }

    // Determine playback range
    let startSec: number;
    let endSec: number;

    if (save.fragment_type === 'predefined') {
      // Use fallback_* (always filled, even for live fragments — snapshot at save time)
      startSec = save.fallback_start_sec!;
      endSec = save.fallback_end_sec!;
    } else {
      startSec = save.custom_start_sec!;
      endSec = save.custom_end_sec!;
    }

    // ── VOD save path ─────────────────────────────────────────────────────
    if (save.session_template_id) {
      // Admin bypass like video/token
      let hasAccess = isAdmin;
      if (!hasAccess) {
        hasAccess = await userHasSessionAccess(effectiveUserId, save.session_template_id, db);
      }
      if (!hasAccess) {
        return NextResponse.json({
          allowed: false,
          title: 'Brak dostępu do sesji',
          message: 'Nie masz aktywnego dostępu do tej sesji.',
        });
      }

      const { data: session } = await db
        .from('session_templates')
        .select('bunny_video_id, bunny_library_id, media_version')
        .eq('id', save.session_template_id)
        .single();

      if (!session?.bunny_video_id) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Plik nagrania nie został odnaleziony.',
        });
      }

      const signed = signMedia({
        bunny_video_id: session.bunny_video_id,
        bunny_library_id: session.bunny_library_id,
        backup_storage_path: null,
        media_version: (session.media_version as number | null) ?? 0,
      }, 3600);

      if (!signed) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Nie można podpisać URL medium.',
        });
      }

      const streamContext = radio ? 'fragment_radio' : 'fragment_review';

      if (!isAdmin) {
        await db.from('active_streams').upsert({
          user_id: effectiveUserId,
          device_id: deviceId,
          session_id: save.session_template_id,
          stream_context: streamContext,
          last_heartbeat: new Date().toISOString(),
        }, { onConflict: 'user_id,device_id' });
      }

      return NextResponse.json({
        allowed: true,
        url: signed.url,
        deliveryType: signed.deliveryType,
        mimeType: signed.mimeType,
        expiresIn: 3600,
        startSec,
        endSec,
        sessionType: streamContext,
      });
    }

    // ── Booking-recording save path ───────────────────────────────────────
    if (save.booking_recording_id) {
      const accessResult = await checkRecordingAccess({
        recordingId: save.booking_recording_id,
        effectiveUserId,
        isDirectAdmin,
        isImpersonating,
        requestingUser: user,
        db,
      });

      if (!accessResult.ok) {
        return NextResponse.json(accessResult.body, { status: accessResult.status });
      }

      const rec = accessResult.recording;
      const tokenTtl = computeTokenTtl(rec.duration_seconds);

      const signed = signMedia({
        bunny_video_id: rec.bunny_video_id,
        bunny_library_id: rec.bunny_library_id,
        backup_storage_path: rec.backup_storage_path,
      }, tokenTtl);

      if (!signed) {
        return NextResponse.json({
          allowed: false,
          title: 'Nagranie niedostępne',
          message: 'Plik nagrania nie jest dostępny.',
        });
      }

      await db.from('active_streams').upsert({
        user_id: effectiveUserId,
        device_id: deviceId,
        booking_recording_id: save.booking_recording_id,
        stream_context: 'fragment_recording_review',
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: 'user_id,device_id' });

      return NextResponse.json({
        allowed: true,
        url: signed.url,
        deliveryType: signed.deliveryType,
        mimeType: signed.mimeType,
        expiresIn: tokenTtl,
        startSec,
        endSec,
        sessionType: 'fragment_recording_review',
      });
    }

    // Should not reach here (DB constraints ensure source XOR)
    return NextResponse.json({ error: 'Invalid save state' }, { status: 500 });

  } catch (error: unknown) {
    console.error('[fragment-token] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
