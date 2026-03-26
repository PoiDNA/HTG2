/**
 * Bunny Storage helpers for file upload/download/list/delete.
 * Used by the publication system for WAV source and edited tracks.
 */

const STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY!;
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'htg2';
const CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://htg2-cdn.b-cdn.net';

function storageUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${cleanPath}`;
}

/**
 * Upload a file to Bunny Storage.
 */
export async function uploadFile(
  path: string,
  buffer: Buffer | ArrayBuffer,
  _contentType?: string
): Promise<{ url: string; cdnUrl: string }> {
  const res = await fetch(storageUrl(path), {
    method: 'PUT',
    headers: {
      AccessKey: STORAGE_API_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: buffer as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Storage upload failed (${res.status}): ${text}`);
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return {
    url: storageUrl(path),
    cdnUrl: `${CDN_URL}/${cleanPath}`,
  };
}

/**
 * Generate a CDN URL for a file. For public files, returns the CDN URL directly.
 * For signed URLs, uses token authentication.
 */
export function getCdnUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${CDN_URL}/${cleanPath}`;
}

/**
 * Download a file from Bunny Storage (server-side proxy).
 */
export async function downloadFile(path: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
}> {
  const res = await fetch(storageUrl(path), {
    method: 'GET',
    headers: {
      AccessKey: STORAGE_API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Bunny Storage download failed (${res.status})`);
  }

  return {
    buffer: await res.arrayBuffer(),
    contentType: res.headers.get('Content-Type') || 'application/octet-stream',
  };
}

/**
 * List files in a Bunny Storage folder.
 */
export async function listFiles(prefix: string): Promise<BunnyFile[]> {
  const cleanPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${cleanPrefix}/`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      AccessKey: STORAGE_API_KEY,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Bunny Storage list failed (${res.status})`);
  }

  return res.json();
}

/**
 * Delete a file from Bunny Storage.
 */
export async function deleteFile(path: string): Promise<void> {
  const res = await fetch(storageUrl(path), {
    method: 'DELETE',
    headers: {
      AccessKey: STORAGE_API_KEY,
    },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny Storage delete failed (${res.status})`);
  }
}

export interface BunnyFile {
  Guid: string;
  StorageZoneName: string;
  Path: string;
  ObjectName: string;
  Length: number;
  LastChanged: string;
  ServerId: number;
  ArrayNumber: number;
  IsDirectory: boolean;
  UserId: string;
  ContentType: string;
  DateCreated: string;
  StorageZoneId: number;
  Checksum: string;
  ReplicatedZones: string;
}
