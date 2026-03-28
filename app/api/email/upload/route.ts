import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/email/auth';
import { uploadFile, getCdnUrl } from '@/lib/bunny-storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

// POST /api/email/upload — upload file attachments for email compose
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Max ${MAX_FILES} files at once` }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      results.push({ filename: file.name, error: 'File too large (max 10MB)' });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const bunnyPath = `email-uploads/${user.id}/${timestamp}_${safeName}`;

    try {
      const { cdnUrl } = await uploadFile(bunnyPath, buffer);
      results.push({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        bunny_path: bunnyPath,
        cdn_url: cdnUrl,
      });
    } catch (err: any) {
      results.push({ filename: file.name, error: err.message || 'Upload failed' });
    }
  }

  return NextResponse.json({ files: results });
}
