import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

function detectMagicBytes(buf: Buffer): string {
  if (buf.length < 4) return 'unknown';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf.length >= 8 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'mp4/ftyp';
  if (buf.length >= 8 && buf.slice(4, 8).toString('ascii') === 'isom') return 'mp4/isom';
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav/riff';
  if (buf[0] === 0xff && (buf[1] === 0xf1 || buf[1] === 0xf9)) return 'aac/adts';
  return 'unknown';
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const formData = await req.formData();
  const audio = formData.get('audio') as File | null;
  const reportedMime = formData.get('mimeType') as string | null;
  const reportedDuration = formData.get('duration') as string | null;
  const browser = formData.get('browser') as string | null;
  const platform = formData.get('platform') as string | null;

  if (!audio) {
    return NextResponse.json({ error: 'No audio blob' }, { status: 400 });
  }

  const bytes = await audio.arrayBuffer();
  const buf = Buffer.from(bytes);

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Buffer.from(hashBuffer).toString('hex').slice(0, 16) + '…';

  return NextResponse.json({
    server_readable: true,
    received_size: buf.byteLength,
    content_type_header: audio.type || '(empty)',
    reported_mime: reportedMime,
    reported_duration_sec: reportedDuration ? parseFloat(reportedDuration) : null,
    browser,
    platform,
    magic_bytes: buf.slice(0, 8).toString('hex'),
    magic_detected: detectMagicBytes(buf),
    sha256_prefix: sha256,
    timestamp: new Date().toISOString(),
  });
}
