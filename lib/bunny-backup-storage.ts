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
