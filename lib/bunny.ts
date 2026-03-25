import crypto from 'crypto';

/**
 * Generate a signed URL for Bunny Stream video playback.
 * Uses Bunny CDN Token Authentication (HMAC-SHA256).
 *
 * @param videoId - Bunny Stream video GUID
 * @param libraryId - Bunny Stream library ID
 * @param ttlSeconds - URL validity in seconds (default: 15 minutes)
 * @returns Signed HLS playlist URL
 */
export function signBunnyUrl(videoId: string, libraryId: string, ttlSeconds = 900): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tokenKey = process.env.BUNNY_TOKEN_KEY!;
  const path = `/${videoId}/playlist.m3u8`;

  const hashableBase = tokenKey + path + String(expires);
  const token = crypto
    .createHash('sha256')
    .update(hashableBase)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `https://vz-${libraryId}.b-cdn.net${path}?token=${token}&expires=${expires}`;
}
