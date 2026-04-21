import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireBearer, jsonError } from '../../../_lib/auth';
import { isSessionEntitled } from '../../../_lib/entitlement';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_SEC = 10 * 60;

/**
 * Return a signed Bunny HLS URL for a session, short-lived.
 *
 * Assumes sessions table has:
 *   bunny_library_id  text
 *   bunny_video_id    text
 *   media_version     int
 *
 * Signed URL generation reuses Bunny token auth (env: BUNNY_CDN_HOSTNAME,
 * BUNNY_TOKEN_KEY). Mobile refreshes 60s before expiresAt.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const admin = createSupabaseServiceRole();

  const entitled = await isSessionEntitled(admin, auth.user.id, id);
  if (!entitled) return jsonError('Not entitled', 403);

  const { data: session } = await admin
    .from('sessions')
    .select('id, bunny_library_id, bunny_video_id, media_version')
    .eq('id', id)
    .maybeSingle();

  if (!session?.bunny_library_id || !session?.bunny_video_id) {
    return jsonError('No playback source', 404);
  }

  const hostname = process.env.BUNNY_CDN_HOSTNAME;
  const tokenKey = process.env.BUNNY_TOKEN_KEY;
  if (!hostname || !tokenKey) {
    return jsonError('Playback not configured', 500);
  }

  const expiresAtEpoch = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const path = `/${session.bunny_library_id}/${session.bunny_video_id}/playlist.m3u8`;

  const crypto = await import('node:crypto');
  const hashBase = `${tokenKey}${path}${expiresAtEpoch}`;
  const token = crypto
    .createHash('sha256')
    .update(hashBase)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = `https://${hostname}${path}?token=${token}&expires=${expiresAtEpoch}&v=${session.media_version ?? 0}`;

  return NextResponse.json({
    url,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
    mediaVersion: session.media_version ?? 0,
    mimeType: 'application/vnd.apple.mpegurl',
  });
}
