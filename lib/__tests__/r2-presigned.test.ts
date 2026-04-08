import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractR2ObjectKey } from '../r2-presigned';

const ORIG_BUCKET = process.env.R2_BUCKET;

beforeEach(() => {
  process.env.R2_BUCKET = 'htg-rec';
});

afterEach(() => {
  if (ORIG_BUCKET === undefined) delete process.env.R2_BUCKET;
  else process.env.R2_BUCKET = ORIG_BUCKET;
});

describe('extractR2ObjectKey', () => {
  it('strips bucket prefix from full R2 URL', () => {
    const url = 'https://abc.r2.cloudflarestorage.com/htg-rec/recordings/room123/sesja.mp4';
    expect(extractR2ObjectKey(url)).toBe('recordings/room123/sesja.mp4');
  });

  it('handles URL without bucket in path', () => {
    const url = 'https://htg-rec.abc.r2.cloudflarestorage.com/recordings/room123/file.ogg';
    expect(extractR2ObjectKey(url)).toBe('recordings/room123/file.ogg');
  });

  it('returns null for empty/undefined input', () => {
    expect(extractR2ObjectKey('')).toBeNull();
    expect(extractR2ObjectKey(null)).toBeNull();
    expect(extractR2ObjectKey(undefined)).toBeNull();
  });

  it('returns plain key unchanged if not a URL', () => {
    expect(extractR2ObjectKey('recordings/room/file.mp4')).toBe('recordings/room/file.mp4');
  });

  it('respects custom bucket name from env', () => {
    process.env.R2_BUCKET = 'custom-bucket';
    const url = 'https://abc.r2.cloudflarestorage.com/custom-bucket/some/path.mp4';
    expect(extractR2ObjectKey(url)).toBe('some/path.mp4');
  });

  it('handles nested paths correctly', () => {
    const url = 'https://abc.r2.cloudflarestorage.com/htg-rec/recordings/room/analytics/id-sid-123.ogg';
    expect(extractR2ObjectKey(url)).toBe('recordings/room/analytics/id-sid-123.ogg');
  });

  it('strips leading slash from pathname only once', () => {
    const url = 'https://abc.r2.cloudflarestorage.com/htg-rec/file.mp4';
    const result = extractR2ObjectKey(url);
    expect(result).toBe('file.mp4');
    expect(result?.startsWith('/')).toBe(false);
  });
});
