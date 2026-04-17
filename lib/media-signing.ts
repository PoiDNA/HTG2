/**
 * lib/media-signing.ts
 *
 * Unified media signing helper for fragment-token and future multi-source routes.
 * Encapsulates all three delivery paths from lib/bunny.ts into a single call that
 * returns the signed URL, deliveryType, and mimeType — avoiding copy-paste of the
 * signing logic across route files.
 *
 * Used by:
 *   - app/api/video/fragment-token/route.ts  (PR 5)
 *   - Future: consolidation of video/token and booking-recording-token (v1.1)
 *
 * Delivery priority (mirrors booking-recording-token/route.ts):
 *   1. backup_storage_path → HTG2 Pull Zone (signHtg2StorageUrl)
 *   2. bunny_video_id + bunny_library_id → Bunny Stream HLS (signBunnyUrl)
 *   3. bunny_video_id only (no library) → Private CDN direct (signPrivateCdnUrl)
 */

import { signBunnyUrl, signPrivateCdnUrl, signHtg2StorageUrl } from '@/lib/bunny';

export type DeliveryType = 'hls' | 'direct';

export interface MediaSource {
  bunny_video_id:      string | null;
  bunny_library_id:    string | null;
  backup_storage_path: string | null;
}

export interface SignedMedia {
  url:          string;
  deliveryType: DeliveryType;
  mimeType:     string | null;
}

// MIME map shared across all signing paths
const MIME_MAP: Record<string, string> = {
  'm4a':  'audio/mp4',
  'mp3':  'audio/mpeg',
  'ogg':  'audio/ogg',
  'wav':  'audio/wav',
  'aac':  'audio/aac',
  'webm': 'audio/webm',
  'mp4':  'audio/mp4', // HTG2 session is audio-only composite MP4
  'm4v':  'video/mp4',
  'mov':  'video/quicktime',
};

function guessMimeType(path: string | null): string | null {
  if (!path) return null;
  const ext = path.split('.').pop()?.toLowerCase();
  return (ext && MIME_MAP[ext]) ?? null;
}

/**
 * Sign a media source and return URL + delivery metadata.
 *
 * @param source     - The media source fields (from session_templates or booking_recordings)
 * @param ttlSeconds - URL validity in seconds
 * @returns SignedMedia, or null if no viable source is available
 */
export function signMedia(source: MediaSource, ttlSeconds: number): SignedMedia | null {
  const { bunny_video_id, bunny_library_id, backup_storage_path } = source;

  // ── 1. HTG2 Storage (preferred for recordings) ──────────────────────────
  if (backup_storage_path) {
    const signed = signHtg2StorageUrl(backup_storage_path, ttlSeconds);
    if (!signed) return null; // env vars missing — caller should return 403
    return {
      url: signed,
      deliveryType: 'direct',
      mimeType: guessMimeType(backup_storage_path),
    };
  }

  // ── 2. Bunny Stream HLS ─────────────────────────────────────────────────
  if (bunny_video_id && bunny_library_id) {
    return {
      url: signBunnyUrl(bunny_video_id, bunny_library_id, ttlSeconds),
      deliveryType: 'hls',
      mimeType: null, // HLS manifests don't need a MIME type hint
    };
  }

  // ── 3. Private CDN direct (legacy / VOD without library) ────────────────
  if (bunny_video_id) {
    return {
      url: signPrivateCdnUrl(bunny_video_id, ttlSeconds),
      deliveryType: 'direct',
      mimeType: guessMimeType(bunny_video_id),
    };
  }

  // No viable source
  return null;
}

/**
 * Compute token TTL for a media source.
 * Matches booking-recording-token logic: at least 1h, or duration + 1h.
 */
export function computeTokenTtl(durationSeconds: number | null, minSeconds = 3600): number {
  return Math.max(minSeconds, (durationSeconds ?? 0) + minSeconds);
}
