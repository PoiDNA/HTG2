// Download audio track files from R2 using presigned URLs.
// Analytics track egress URLs stored in analytics_track_egresses.file_url are
// full R2 URLs — we extract the object key, generate a presigned URL, and fetch.

import { generateR2PresignedUrl, extractR2ObjectKey } from '@/lib/r2-presigned';
import { AnalysisError } from './errors';

export async function downloadFromR2(fileUrl: string): Promise<ArrayBuffer> {
  const key = extractR2ObjectKey(fileUrl);
  if (!key) {
    throw new AnalysisError('download_failed', 'cannot extract R2 object key');
  }

  let presigned: string;
  try {
    presigned = generateR2PresignedUrl(key, 1800); // 30 min TTL
  } catch (e) {
    throw new AnalysisError('download_failed', `presign failed: ${(e as Error)?.message}`);
  }

  const res = await fetch(presigned);
  if (!res.ok) {
    throw new AnalysisError('download_failed', `R2 ${res.status}`);
  }
  return res.arrayBuffer();
}
