import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { uploadFile, deleteFile } from '@/lib/bunny-storage';

// NOTE on platform body limits (Vercel / App Router):
// The `api.bodyParser` config is Pages Router syntax and has no effect in
// Route Handlers. For serverless hosts the primary DoW guard is the platform
// body limit itself (~4.5 MB default on Hobby, configurable on Pro). Our
// MAX_UPLOAD_BYTES is a ceiling enforced AFTER the platform already accepted
// the body. Real rate of 60s @ 640x480 @ 15fps at VP9 is typically under 10 MB;
// 50 MB is a generous upper bound for audio+tolerance.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB upper bound
const RATE_LIMIT_PER_HOUR = 10;

// Server-side cap on client-provided duration (integrity protection for
// analytics; does not affect actual recording length).
const MAX_DURATION_SECONDS_BY_TYPE: Record<'before' | 'after', number> = {
  before: 60,
  after: 300,
};

// Phase-context validation:
// 'before' uploads must come from a live session currently in 'poczekalnia'
// (waiting room). 'after' uploads must come from a session in 'outro' or 'ended'.
// Phase values from supabase/migrations/005_live_sessions.sql:13-15 CHECK constraint:
// ('poczekalnia','wstep','przejscie_1','sesja','przejscie_2','podsumowanie','outro','ended').
const ALLOWED_PHASES: Record<'before' | 'after', string[]> = {
  before: ['poczekalnia'],
  after: ['outro', 'ended'],
};

// Container-level magic bytes detection.
// EBML (1A 45 DF A3) is used by BOTH audio/webm and video/webm — distinguishing
// audio-only vs video-only tracks would require Matroska parsing. Same for MP4
// 'ftyp' atom. Strategy: return just the CONTAINER family, then cross-check
// with the user-declared `format` field in mimeForContainerFormat().
type ContainerFamily = 'webm' | 'mp4' | 'ogg' | null;

function detectContainerFromMagicBytes(buf: Buffer): ContainerFamily {
  if (buf.length < 16) return null;
  // WebM / Matroska: 1A 45 DF A3 (EBML header)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'webm';
  }
  // MP4 / M4A: bytes 4-7 are 'ftyp'
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return 'mp4';
  }
  // OGG: 'OggS'
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return 'ogg';
  }
  return null;
}

// Valid (container, declared-format) pairs. OGG is audio-only in our pipeline.
function mimeForContainerFormat(
  container: ContainerFamily,
  format: 'video' | 'audio'
): string | null {
  if (!container) return null;
  if (container === 'webm') return format === 'video' ? 'video/webm' : 'audio/webm';
  if (container === 'mp4') return format === 'video' ? 'video/mp4' : 'audio/mp4';
  if (container === 'ogg') return format === 'audio' ? 'audio/ogg' : null; // no video/ogg
  return null;
}

function extFromContainer(container: ContainerFamily, format: 'video' | 'audio'): string {
  if (container === 'webm') return 'webm';
  if (container === 'mp4') return format === 'audio' ? 'm4a' : 'mp4';
  if (container === 'ogg') return 'ogg';
  return 'bin';
}

async function verifyBookingOwnership(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  bookingId: string,
  userId: string
): Promise<boolean> {
  // Check primary booking owner
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return false;
  if (booking.user_id === userId) return true;

  // Check booking_companions (for natalia_para sessions).
  // IMPORTANT: must require accepted_at IS NOT NULL — matches the live-room
  // access check in app/[locale]/live/[sessionId]/page.tsx:57-63. A companion
  // that was added but hasn't yet accepted the invitation must NOT be able
  // to upload recordings (auth parity with live-room entry).
  const { data: companion } = await admin
    .from('booking_companions')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .maybeSingle();

  return !!companion;
}

async function checkRateLimit(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  userId: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('client_recordings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  return (count ?? 0) < RATE_LIMIT_PER_HOUR;
}

async function verifyLiveSessionContext(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  liveSessionId: string,
  bookingId: string,
  type: 'before' | 'after'
): Promise<{ ok: boolean; reason?: string }> {
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, booking_id, phase')
    .eq('id', liveSessionId)
    .maybeSingle();

  if (!session) return { ok: false, reason: 'Live session not found' };
  if (session.booking_id !== bookingId) {
    return { ok: false, reason: 'liveSessionId does not belong to bookingId' };
  }
  if (!ALLOWED_PHASES[type].includes(session.phase)) {
    return {
      ok: false,
      reason: `Cannot upload ${type} recording when session phase is ${session.phase}`,
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createSupabaseServiceRole();

    // 2. Rate limit — BEFORE parsing body. On standalone hosts this avoids
    // loading large bodies into RAM for spam attempts. On Vercel the body is
    // already buffered by the platform before the handler runs, so this
    // primarily saves CPU on formData() parsing; the real DoW guard is the
    // platform body limit (~4.5 MB Hobby default). Still worth the reorder.
    // Caveat: this limits *successful inserts*, not *attempts* — a determined
    // attacker sending garbage requests that will 403/415 can still tax the
    // platform. That's WAF/platform territory, out of scope here.
    const withinLimit = await checkRateLimit(admin, user.id);
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many uploads, try again later' }, { status: 429 });
    }

    // 3. Parse body (only after rate limit)
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bookingId = formData.get('bookingId') as string | null;
    const liveSessionId = formData.get('liveSessionId') as string | null;
    const type = formData.get('type') as string | null;
    const format = formData.get('format') as string | null;
    const duration = parseInt((formData.get('duration') as string | null) ?? '0') || 0;

    // liveSessionId is now REQUIRED (was optional). Needed for phase-context validation.
    if (!file || !bookingId || !liveSessionId || !type || !format) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (type !== 'before' && type !== 'after') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    if (format !== 'video' && format !== 'audio') {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    // Clamp duration to server-side maximum (integrity protection — don't trust client)
    const maxDuration = MAX_DURATION_SECONDS_BY_TYPE[type];
    const safeDuration = Math.max(0, Math.min(duration, maxDuration));

    // 4. Hard size limit (DoW protection, secondary layer behind platform limit)
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    // 5. IDOR/BOLA protection — verify the booking belongs to this user.
    // Without this check, any authenticated user could attach recordings to
    // an arbitrary bookingId (server-side object reference abuse).
    const owns = await verifyBookingOwnership(admin, bookingId, user.id);
    if (!owns) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 6. Phase/session-context validation — prevents "yesterday's before",
    // "mid-session before", "never-started after", and "wrong session"
    // uploads. liveSessionId must belong to bookingId and be in the right phase.
    const ctx = await verifyLiveSessionContext(admin, liveSessionId, bookingId, type);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.reason }, { status: 403 });
    }

    // 7. Read into buffer (size already validated above)
    const buffer = Buffer.from(await file.arrayBuffer());

    // 8. Container detection via magic bytes (don't trust file.type from FormData).
    // Returns container family only — we cross-check with declared format.
    const container = detectContainerFromMagicBytes(buffer);
    const detectedMime = mimeForContainerFormat(container, format);
    if (!detectedMime) {
      return NextResponse.json(
        {
          error: container
            ? `Container ${container} not valid for format ${format}`
            : 'Unsupported file format (unknown container)',
          detectedContainer: container,
        },
        { status: 415 }
      );
    }

    // 9. Upload to Bunny Storage with correct extension
    const ext = extFromContainer(container, format);
    const path = `client-recordings/${user.id}/${bookingId}/${type}-${Date.now()}.${ext}`;

    await uploadFile(path, buffer, detectedMime);

    const cdnUrl = `${process.env.NEXT_PUBLIC_BUNNY_CDN_URL}/${path}`;

    // 10. Save to DB (use server-clamped duration, not client-provided).
    // If INSERT fails, best-effort delete the already-uploaded Bunny file so
    // we don't accumulate orphaned storage (cost + uncontrolled artifacts).
    const { data: recording, error: dbError } = await admin
      .from('client_recordings')
      .insert({
        user_id: user.id,
        booking_id: bookingId,
        live_session_id: liveSessionId,
        type,
        format,
        storage_url: cdnUrl,
        duration_seconds: safeDuration,
        file_size_bytes: buffer.length,
        sharing_mode: 'private',
      })
      .select('id')
      .single();

    if (dbError) {
      // Best-effort cleanup — swallow cleanup errors, still return the
      // original dbError to the caller.
      try {
        await deleteFile(path);
      } catch (cleanupErr) {
        console.error('[client-recording] orphan cleanup failed:', cleanupErr);
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ id: recording.id, url: cdnUrl });
  } catch (error: unknown) {
    console.error('Client recording upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — list recordings for a booking (scoped to current user unless staff)
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const admin = createSupabaseServiceRole();
  const { isStaffEmail } = await import('@/lib/roles');
  const staff = isStaffEmail(user.email ?? '');

  let query = admin.from('client_recordings').select('*');

  if (bookingId) {
    query = query.eq('booking_id', bookingId);
    if (!staff) query = query.eq('user_id', user.id);
  } else {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recordings: data });
}
