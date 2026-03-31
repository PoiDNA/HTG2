/**
 * R2 Pre-Signed URL generator for booking recordings.
 * Uses AWS Signature V4 (R2 is S3-compatible) without @aws-sdk dependency.
 *
 * Pre-Signed URLs are used to let Bunny Stream fetch private files from R2
 * without exposing the R2 bucket publicly.
 *
 * TTL: 24h (Bunny may queue large files for processing).
 */

import crypto from 'crypto';

const R2_ACCESS_KEY = () => (process.env.R2_ACCESS_KEY ?? '').trim();
const R2_SECRET_KEY = () => (process.env.R2_SECRET_KEY ?? '').trim();
const R2_ENDPOINT = () => (process.env.R2_ENDPOINT ?? '').trim();
const R2_BUCKET = () => (process.env.R2_BUCKET ?? 'htg-rec').trim();

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a Pre-Signed URL for GET access to an R2 object.
 *
 * @param objectKey - The object key in R2 (e.g. "recordings/abc123/sesja.mp4")
 * @param ttlSeconds - URL validity (default: 24 hours)
 * @returns Pre-Signed URL string
 */
export function generateR2PresignedUrl(
  objectKey: string,
  ttlSeconds: number = 86400 // 24h
): string {
  const accessKey = R2_ACCESS_KEY();
  const secretKey = R2_SECRET_KEY();
  const endpoint = R2_ENDPOINT();
  const bucket = R2_BUCKET();

  if (!accessKey || !secretKey || !endpoint) {
    throw new Error('R2 credentials not configured (R2_ACCESS_KEY, R2_SECRET_KEY, R2_ENDPOINT)');
  }

  // Parse endpoint to get host
  const endpointUrl = new URL(endpoint);
  const host = `${bucket}.${endpointUrl.hostname}`;
  const region = 'auto'; // R2 uses 'auto'

  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0].slice(0, 8); // YYYYMMDD
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; // YYYYMMDDTHHMMSSZ

  const cleanKey = objectKey.startsWith('/') ? objectKey.slice(1) : objectKey;
  const canonicalUri = '/' + cleanKey.split('/').map(encodeURIComponent).join('/');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;

  // Query parameters (sorted)
  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(ttlSeconds),
    'X-Amz-SignedHeaders': 'host',
  });

  // Sort params
  const sortedParams = new URLSearchParams([...queryParams.entries()].sort());

  // Canonical request
  const canonicalRequest = [
    'GET',
    canonicalUri,
    sortedParams.toString(),
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  // String to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');

  // Signature
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  sortedParams.set('X-Amz-Signature', signature);

  return `https://${host}${canonicalUri}?${sortedParams.toString()}`;
}

/**
 * Delete an object from R2 using the S3-compatible API.
 */
export async function deleteR2Object(objectKey: string): Promise<void> {
  const accessKey = R2_ACCESS_KEY();
  const secretKey = R2_SECRET_KEY();
  const endpoint = R2_ENDPOINT();
  const bucket = R2_BUCKET();

  if (!accessKey || !secretKey || !endpoint) {
    throw new Error('R2 credentials not configured');
  }

  const endpointUrl = new URL(endpoint);
  const host = `${bucket}.${endpointUrl.hostname}`;
  const region = 'auto';

  const cleanKey = objectKey.startsWith('/') ? objectKey.slice(1) : objectKey;
  const canonicalUri = '/' + cleanKey.split('/').map(encodeURIComponent).join('/');

  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0].slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const payloadHash = sha256('');

  const canonicalRequest = [
    'DELETE',
    canonicalUri,
    '',
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
  });

  // 204 = deleted, 404 = already gone
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const text = await res.text();
    throw new Error(`R2 delete failed (${res.status}): ${text}`);
  }
}
