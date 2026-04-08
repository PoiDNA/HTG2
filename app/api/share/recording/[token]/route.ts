import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signPrivateCdnUrl } from '@/lib/bunny';

// Very short TTL for shared-link playback URLs. The share token is the
// long-lived thing (7 days or permanent); the signed Bunny URL is only
// valid for 15 minutes to minimize the blast radius of a leaked URL being
// scraped from logs, history, etc. Recipient must fetch the URL and play
// within 15 minutes — fine for interactive use, not for hotlinking.
const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

/**
 * GET /api/share/recording/[token]
 *
 * Public endpoint — no authentication required. Resolves a share token to
 * a short-lived signed Bunny CDN URL that the recipient's browser can use
 * to download the recording.
 *
 * Happy path:
 *   1. Lookup token in client_recording_shares WHERE revoked_at IS NULL
 *   2. Check expires_at > now (if not NULL)
 *   3. Lookup recording, verify not soft-deleted
 *   4. Sign Bunny CDN URL with 15-minute TTL
 *   5. Return 302 redirect to signed URL
 *
 * Design decisions:
 *   - Returns 302 redirect (not JSON) so the recipient can just click the
 *     link in a message/email and the browser does the right thing.
 *   - 404 for all failure modes (wrong token, expired, revoked, deleted
 *     recording) so attackers can't enumerate valid tokens.
 *   - No rate limit here — Bunny CDN itself handles abuse at the edge, and
 *     the DB lookup is a single indexed query.
 *   - Does NOT write to client_recording_audit — share views are
 *     anonymous by design (the whole point is "send a link to a friend").
 *     If you need audit for shared views, that's a different feature
 *     (would require the recipient to authenticate first).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      // Use 404 consistently for all failure modes
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const db = createSupabaseServiceRole();

    // Step 1: lookup token. Join to recording to avoid a second query.
    const { data: share } = await db
      .from('client_recording_shares')
      .select(`
        id,
        recording_id,
        expires_at,
        revoked_at,
        recording:client_recordings!inner(
          id,
          storage_url,
          deleted_at
        )
      `)
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 2: check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 3: check recording not soft-deleted.
    // Supabase PostgREST returns joined rows as array even for !inner, normalize.
    const rec = Array.isArray(share.recording) ? share.recording[0] : share.recording;
    if (!rec || rec.deleted_at) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: sign short-lived URL (15 min). The signed URL does NOT carry
    // the token — it's a standalone Bunny CDN URL with HMAC. Once the
    // recipient has it, they have 15 minutes to use it. After that they'd
    // need to hit this endpoint again (which they can do until the share
    // token itself expires).
    const signedUrl = signPrivateCdnUrl(rec.storage_url, SIGNED_URL_TTL_SECONDS);

    // Step 5: 302 redirect. Browser follows, Bunny serves the file.
    return NextResponse.redirect(signedUrl, 302);
  } catch (err: unknown) {
    console.error('[share/recording] GET error:', err);
    // Still 404 to preserve uniform failure response (don't leak that the
    // endpoint exists for a given token via 500 vs 404).
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
