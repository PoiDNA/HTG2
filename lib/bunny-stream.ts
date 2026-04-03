/**
 * Bunny Stream Video API client.
 * Used for booking recordings — upload, status check, delete.
 * Docs: https://docs.bunny.net/reference/video
 */

const BUNNY_API_KEY = process.env.BUNNY_API_KEY!;
const BUNNY_API_BASE = 'https://video.bunnycdn.com';

export interface BunnyVideo {
  guid: string;
  title: string;
  dateUploaded: string;
  length: number; // seconds
  status: number; // 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
  encodeProgress: number;
  storageSize: number;
}

async function bunnyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BUNNY_API_BASE}${path}`, {
    ...options,
    headers: {
      AccessKey: BUNNY_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Create a new video object in Bunny Stream library.
 * Returns the GUID to be used for upload/fetch.
 */
export async function createVideo(
  libraryId: string,
  title: string
): Promise<{ guid: string }> {
  const data = await bunnyFetch<{ guid: string }>(
    `/library/${libraryId}/videos`,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    }
  );
  return { guid: data.guid };
}

/**
 * Tell Bunny to fetch a video from a URL (e.g. Pre-Signed R2 URL).
 * Bunny downloads the file itself — zero transfer through our server.
 */
export async function fetchVideoFromUrl(
  libraryId: string,
  videoId: string,
  sourceUrl: string
): Promise<void> {
  await bunnyFetch(
    `/library/${libraryId}/videos/${videoId}/fetch`,
    {
      method: 'POST',
      body: JSON.stringify({ url: sourceUrl }),
    }
  );
}

/**
 * Get video encoding status.
 * Status codes: 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
 */
export async function getVideoStatus(
  libraryId: string,
  videoId: string
): Promise<{ status: number; encodeProgress: number; length: number }> {
  const data = await bunnyFetch<BunnyVideo>(
    `/library/${libraryId}/videos/${videoId}`
  );
  return { status: data.status, encodeProgress: data.encodeProgress, length: data.length };
}

/**
 * Delete a video from Bunny Stream.
 */
export async function deleteVideo(
  libraryId: string,
  videoId: string
): Promise<void> {
  const res = await fetch(
    `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`,
    {
      method: 'DELETE',
      headers: { AccessKey: BUNNY_API_KEY },
    }
  );

  // 404 = already deleted — safe to ignore
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Bunny Stream delete failed (${res.status}): ${text}`);
  }
}

/**
 * List videos in a Bunny Stream library (paginated).
 */
export async function listVideos(
  libraryId: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ items: BunnyVideo[]; totalItems: number }> {
  const data = await bunnyFetch<{ items: BunnyVideo[]; totalItems: number }>(
    `/library/${libraryId}/videos?page=${page}&itemsPerPage=${perPage}`
  );
  return data;
}
