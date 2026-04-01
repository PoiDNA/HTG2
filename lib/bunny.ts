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

/**
 * Generate a signed URL for Bunny CDN Storage Pull Zone (htg-private.b-cdn.net).
 * Used for private session recordings and VOD subscription content.
 *
 * Bunny CDN Token Auth uses SHA256(tokenKey + path + expires) with base64url encoding.
 * Docs: https://docs.bunny.net/docs/cdn-token-authentication
 *
 * @param storagePath - Path within storage zone (e.g. "htg-sessions-arch-03-2026/file.m4v" or "HTG-Month/file.m4v")
 * @param ttlSeconds - URL validity in seconds (default: 4 hours for long audio sessions)
 * @returns Signed CDN URL
 */
export function signPrivateCdnUrl(storagePath: string, ttlSeconds = 14400): string {
  const cdnBase = process.env.BUNNY_PRIVATE_CDN_URL || 'https://htg-private.b-cdn.net';
  const tokenKey = process.env.BUNNY_PRIVATE_TOKEN_KEY || process.env.BUNNY_TOKEN_KEY!;

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  // Path must start with /
  const path = storagePath.startsWith('/') ? storagePath : `/${storagePath}`;

  // Bunny CDN validates token against the RAW (unencoded) path.
  // Do NOT URL-encode the path before hashing — CDN decodes %20 back to spaces internally.
  const hashableBase = tokenKey + path + String(expires);
  const token = crypto
    .createHash('sha256')
    .update(hashableBase)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // encodeURI preserves path separators but encodes spaces → %20
  // Bunny CDN internally decodes %20 back to spaces for file lookup
  return `${cdnBase}${encodeURI(path)}?token=${token}&expires=${expires}`;
}
