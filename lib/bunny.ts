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
  return signBunnyCdnUrlInternal(cdnBase, tokenKey, storagePath, ttlSeconds);
}

/**
 * Generate a signed URL for HTG2 recordings stored in the dedicated Bunny Storage zone
 * (e.g. htg-backup-sessions). Used for live session recordings — Phase 2 audio files
 * served to clients via a dedicated Pull Zone with Token Authentication.
 *
 * Required env vars (all must be set, otherwise returns null → client must fall back):
 *   BUNNY_HTG2_CDN_URL        — Pull Zone URL (e.g. https://htg-backup-sessions.b-cdn.net)
 *   BUNNY_HTG2_CDN_TOKEN_KEY  — Pull Zone Token Auth key (from Bunny panel → Security)
 *
 * @param storagePath - Path within the HTG2 storage zone (e.g. "recordings/{booking_id}/{recording_id}.mp4")
 * @param ttlSeconds - URL validity in seconds (default: 4h)
 * @returns Signed CDN URL, or null if env vars not configured
 */
export function signHtg2StorageUrl(storagePath: string, ttlSeconds = 14400): string | null {
  const cdnBase = process.env.BUNNY_HTG2_CDN_URL;
  const tokenKey = process.env.BUNNY_HTG2_CDN_TOKEN_KEY;
  if (!cdnBase || !tokenKey) return null;
  return signBunnyCdnUrlInternal(cdnBase, tokenKey, storagePath, ttlSeconds);
}

/**
 * Internal helper — shared HMAC token signing logic for any Bunny Pull Zone with Token Auth.
 * Both signPrivateCdnUrl and signHtg2StorageUrl delegate here.
 */
function signBunnyCdnUrlInternal(
  cdnBase: string,
  tokenKey: string,
  storagePath: string,
  ttlSeconds: number,
): string {
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
