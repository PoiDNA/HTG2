import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// 7 days default TTL for time-limited share links. Matches common
// "temporary link" UX expectations (Google Drive, Dropbox default).
const DEFAULT_SHARE_TTL_DAYS = 7;

type ShareMode = 'link' | 'link_permanent';

/**
 * POST /api/live/client-recording/[id]/share
 *
 * Generate a share token for a recording. Only the recording owner can call.
 *
 * Body: { mode: 'link' | 'link_permanent' }
 *   - 'link'           → expires_at = now + 7 days
 *   - 'link_permanent' → expires_at = NULL (until manually revoked)
 *
 * Returns: { token, url, expiresAt }
 *   - token: opaque random string (for API callers)
 *   - url:   full public share URL the owner copies and sends out
 *   - expiresAt: ISO timestamp or null
 *
 * Multiple tokens per recording are allowed — the owner can create a
 * permanent link for family AND a 7-day link for a one-off share, both
 * at once. Revoking drops all active tokens (see DELETE handler below).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: recordingId } = await params;
    if (!recordingId) {
      return NextResponse.json({ error: 'Recording id required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode as ShareMode | undefined;
    if (mode !== 'link' && mode !== 'link_permanent') {
      return NextResponse.json(
        { error: "mode must be 'link' or 'link_permanent'" },
        { status: 400 }
      );
    }

    const db = createSupabaseServiceRole();

    // Verify ownership. 403 for both "not found" and "foreign" recordings
    // (oracle prevention). Also rejects soft-deleted recordings.
    const { data: recording } = await db
      .from('client_recordings')
      .select('id, user_id, deleted_at')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!recording) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate a cryptographically random token. 32 bytes → 43 chars base64url.
    // Not a JWT, not a hash of anything meaningful — just a random opaque string
    // the public endpoint looks up directly.
    const token = crypto.randomBytes(32).toString('base64url');

    const expiresAt = mode === 'link'
      ? new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error: insertError } = await db
      .from('client_recording_shares')
      .insert({
        recording_id: recordingId,
        created_by: user.id,
        token,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[client-recording-share] insert failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://htgcyou.com';
    const shareUrl = `${siteUrl}/api/share/recording/${token}`;

    return NextResponse.json({
      token,
      url: shareUrl,
      expiresAt,
    });
  } catch (err: unknown) {
    console.error('[client-recording-share] POST error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/live/client-recording/[id]/share
 *
 * Revoke ALL active share tokens for a recording. Only the owner can call.
 *
 * This is an "emergency nuke" style endpoint — if the owner realizes a link
 * was leaked or shared by mistake, they can cut off access immediately.
 * Individual-token revoke is out of scope (would need a separate
 * /api/live/client-recording/[id]/share/[token] path).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: recordingId } = await params;
    if (!recordingId) {
      return NextResponse.json({ error: 'Recording id required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // Verify ownership before revoking any tokens.
    const { data: recording } = await db
      .from('client_recordings')
      .select('id, user_id')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!recording) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft-revoke all currently-active tokens (leave the row for audit).
    // Already-revoked tokens are skipped via the WHERE clause.
    const { error: revokeError, count } = await db
      .from('client_recording_shares')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: user.id,
      }, { count: 'exact' })
      .eq('recording_id', recordingId)
      .is('revoked_at', null);

    if (revokeError) {
      console.error('[client-recording-share] revoke failed:', revokeError);
      return NextResponse.json({ error: revokeError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, revokedCount: count ?? 0 });
  } catch (err: unknown) {
    console.error('[client-recording-share] DELETE error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
