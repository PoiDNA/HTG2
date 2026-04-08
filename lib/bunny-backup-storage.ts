/**
 * Bunny Storage helpers for the BACKUP storage zone (warm DR for sesja recordings).
 *
 * Separate from lib/bunny-storage.ts because:
 * - Different storage zone (e.g. HTG_BACKUP_SESSIONS) — must be configured in Bunny panel
 * - Different API key (each Bunny storage zone has its own access password)
 * - Backups are write-mostly, never streamed to clients (warm DR, not hot replica)
 *
 * Env vars (all required to enable backup; missing any → backup disabled):
 *   BUNNY_BACKUP_STORAGE_ZONE     — zone name (e.g. "htg-backup-sessions")
 *   BUNNY_BACKUP_STORAGE_API_KEY  — access password for that zone
 *   BUNNY_BACKUP_STORAGE_HOSTNAME — optional, defaults to storage.bunnycdn.com
 *                                   (use regional endpoints for better latency, e.g.
 *                                    ny.storage.bunnycdn.com or la.storage.bunnycdn.com)
 */

const BACKUP_STORAGE_ZONE = process.env.BUNNY_BACKUP_STORAGE_ZONE ?? '';
const BACKUP_STORAGE_API_KEY = process.env.BUNNY_BACKUP_STORAGE_API_KEY ?? '';
const BACKUP_STORAGE_HOSTNAME = process.env.BUNNY_BACKUP_STORAGE_HOSTNAME ?? 'storage.bunnycdn.com';

/**
 * Returns true when all backup env vars are configured.
 * Used by cron to skip backup fan-out (graceful degradation) when not set up.
 */
export function isBackupStorageConfigured(): boolean {
  return Boolean(BACKUP_STORAGE_ZONE && BACKUP_STORAGE_API_KEY);
}

/**
 * Get the active backup storage zone name (or empty string if not configured).
 * Cron writes this to booking_recordings.backup_storage_zone for audit/recovery.
 */
export function getBackupStorageZone(): string {
  return BACKUP_STORAGE_ZONE;
}

function backupStorageUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://${BACKUP_STORAGE_HOSTNAME}/${BACKUP_STORAGE_ZONE}/${cleanPath}`;
}

/**
 * Upload a buffer to the backup storage zone.
 * Throws if backup storage is not configured (callers should check isBackupStorageConfigured first).
 */
export async function uploadBackupFile(
  path: string,
  buffer: Buffer | ArrayBuffer,
): Promise<{ url: string; storagePath: string }> {
  if (!isBackupStorageConfigured()) {
    throw new Error('Backup storage not configured (missing BUNNY_BACKUP_STORAGE_ZONE or _API_KEY)');
  }

  const url = backupStorageUrl(path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      AccessKey: BACKUP_STORAGE_API_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: buffer as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny backup storage upload failed (${res.status}): ${text}`);
  }

  return {
    url,
    storagePath: path.startsWith('/') ? path.slice(1) : path,
  };
}

/**
 * Delete a file from the backup storage zone.
 * Returns true if deleted (or already gone), false on unexpected error.
 */
export async function deleteBackupFile(path: string): Promise<boolean> {
  if (!isBackupStorageConfigured()) {
    return false;
  }

  const res = await fetch(backupStorageUrl(path), {
    method: 'DELETE',
    headers: {
      AccessKey: BACKUP_STORAGE_API_KEY,
    },
  });

  // 404 = already gone, treat as success
  return res.ok || res.status === 404;
}

/**
 * Sanitize a string for safe use inside a Bunny Storage path segment.
 * Keeps ASCII letters, digits, dot, dash, underscore, @. Replaces anything
 * else (including Polish diacritics, spaces, `+`, `/`) with an underscore.
 * Also lowercases and collapses consecutive underscores.
 *
 *   "Łukasz+test@example.com" → "_ukasz_test@example.com"
 *   "Jan Kowalski"            → "jan_kowalski"
 */
function sanitizeForPath(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.\-_@]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

/**
 * Build the Bunny Storage path for a live session recording.
 *
 * Format: `recordings/{YYYY-MM-DD}/{email}/{phase}-{session_type}-{short_id}.{ext}`
 *
 * The path is designed to be human-navigable after downloading to a local disk:
 *   - Date folder → chronological sorting by `ls`
 *   - Email folder → one folder per client per day
 *   - Filename prefix `{phase}-{session_type}` → filter with `find -name "sesja-*"`
 *   - `short_id` (first 8 chars of recording UUID) → uniqueness in case of retry
 *
 * Example:
 *   recordings/2026-04-08/jan.kowalski@example.com/sesja-natalia_solo-f7d9e2a5.mp4
 */
export function buildRecordingStoragePath(params: {
  sessionDate: string | null;    // booking_slots.slot_date (YYYY-MM-DD)
  userEmail: string | null;       // profiles.email of booking owner
  phase: string | null;           // booking_recordings.recording_phase
  sessionType: string | null;     // bookings.session_type
  recordingId: string;            // booking_recordings.id (UUID)
  extension: string;              // file extension from source_url (e.g. "mp4")
}): string {
  const date = params.sessionDate ?? 'unknown-date';
  const email = sanitizeForPath(params.userEmail ?? 'unknown-user');
  const phase = sanitizeForPath(params.phase ?? 'sesja');
  const sessionType = sanitizeForPath(params.sessionType ?? 'unknown');
  const shortId = params.recordingId.slice(0, 8);
  const ext = sanitizeForPath(params.extension || 'mp4');

  return `recordings/${date}/${email}/${phase}-${sessionType}-${shortId}.${ext}`;
}
