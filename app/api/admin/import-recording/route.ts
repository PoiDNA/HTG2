import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { createVideo } from '@/lib/bunny-stream';
import crypto from 'crypto';

const BUNNY_API_KEY = process.env.BUNNY_API_KEY!;
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID!;
const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

/**
 * POST /api/admin/import-recording
 *
 * Creates a Bunny Stream video, initialises TUS upload server-side (so the
 * API key never leaves the server), and returns the TUS Location URL so the
 * browser can stream the file directly to Bunny with a single PATCH request.
 *
 * Body: {
 *   sessionType: string,
 *   sessionDate: string (YYYY-MM-DD),
 *   userEmails: string[],
 *   title?: string,
 *   fileSize: number,
 *   fileName: string,
 * }
 *
 * Response: { recordingId, tusUploadUrl, resolvedUsers }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth — admin only
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    const body = await request.json();
    const { sessionType, sessionDate, userEmails, title, fileSize, fileName } = body;

    if (!sessionType || !sessionDate || !Array.isArray(userEmails) || userEmails.length === 0) {
      return NextResponse.json({
        error: 'Wymagane pola: sessionType, sessionDate, userEmails (min 1)',
      }, { status: 400 });
    }

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json({ error: 'Wymagane pole: fileSize' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // 2. Resolve user emails → user IDs
    const resolvedUsers: Array<{ id: string; email: string; displayName: string | null }> = [];
    for (const email of userEmails) {
      const { data: profile } = await db
        .from('profiles')
        .select('id, display_name, email')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (!profile) {
        return NextResponse.json({
          error: `Nie znaleziono użytkownika: ${email}`,
        }, { status: 400 });
      }
      resolvedUsers.push({ id: profile.id, email: profile.email, displayName: profile.display_name });
    }

    // 3. Create Bunny Stream video object
    const videoTitle = title || `Import — ${sessionDate} — ${sessionType}`;
    const { guid: bunnyVideoId } = await createVideo(BUNNY_LIBRARY_ID, videoTitle);

    // 4. Initialise TUS upload server-side — API key stays on the server
    // SHA256(library_id + api_key + expiration_time + video_id)
    const expirationTime = Math.floor(Date.now() / 1000) + 24 * 3600;
    const authSignature = crypto
      .createHash('sha256')
      .update(BUNNY_LIBRARY_ID + BUNNY_API_KEY + String(expirationTime) + bunnyVideoId)
      .digest('hex');

    const tusRes = await fetch(BUNNY_TUS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(fileSize),
        'AuthorizationSignature': authSignature,
        'AuthorizationExpire': String(expirationTime),
        'VideoId': bunnyVideoId,
        'LibraryId': BUNNY_LIBRARY_ID,
      },
    });

    if (!tusRes.ok) {
      const body = await tusRes.text().catch(() => '');
      console.error(`[import-recording] Bunny TUS init failed ${tusRes.status}: ${body}`);
      return NextResponse.json(
        { error: `Błąd inicjalizacji uploadu Bunny (${tusRes.status})` },
        { status: 502 },
      );
    }

    const tusUploadUrl = tusRes.headers.get('location');
    if (!tusUploadUrl) {
      console.error('[import-recording] Bunny TUS init: no Location header');
      return NextResponse.json(
        { error: 'Bunny nie zwrócił adresu uploadu' },
        { status: 502 },
      );
    }

    // 5. Create booking_recordings row
    const { data: recording, error: insertError } = await db
      .from('booking_recordings')
      .insert({
        bunny_video_id: bunnyVideoId,
        bunny_library_id: BUNNY_LIBRARY_ID,
        session_type: sessionType,
        session_date: sessionDate,
        title: videoTitle,
        source: 'import',
        status: 'uploading',
        import_filename: fileName || null,
        import_confidence: 'admin_assigned',
        expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        metadata: {
          imported_by: user.email,
          imported_at: new Date().toISOString(),
          original_filename: fileName,
          assigned_emails: userEmails,
        },
      })
      .select('id')
      .single();

    if (insertError || !recording) {
      console.error('[import-recording] DB insert error:', insertError);
      return NextResponse.json({ error: 'Błąd tworzenia rekordu nagrania' }, { status: 500 });
    }

    // 6. Grant access to each user
    for (const u of resolvedUsers) {
      await db.from('booking_recording_access').insert({
        recording_id: recording.id,
        user_id: u.id,
        granted_reason: 'admin_grant',
      });
    }

    // 7. Audit trail
    await db.from('booking_recording_audit').insert({
      recording_id: recording.id,
      action: 'recording_created',
      actor_id: user.id,
      details: {
        source: 'import',
        session_type: sessionType,
        session_date: sessionDate,
        assigned_users: resolvedUsers.map(u => ({ id: u.id, email: u.email })),
        filename: fileName,
      },
    });

    await db.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'import_recording',
      details: {
        recording_id: recording.id,
        bunny_video_id: bunnyVideoId,
        session_type: sessionType,
        user_emails: userEmails,
      },
    });

    // 8. Return TUS upload URL — browser PATCHes file data directly to Bunny
    return NextResponse.json({
      recordingId: recording.id,
      tusUploadUrl,
      resolvedUsers: resolvedUsers.map(u => ({
        email: u.email,
        displayName: u.displayName,
      })),
    });
  } catch (err) {
    console.error('[import-recording] Error:', err);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}
