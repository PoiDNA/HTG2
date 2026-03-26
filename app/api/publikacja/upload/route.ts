import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';
import { uploadFile } from '@/lib/bunny-storage';

export async function POST(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const publicationId = formData.get('publicationId') as string;
  const type = formData.get('type') as string;
  const fileName = formData.get('fileName') as string;

  if (!file || !publicationId || !type || !fileName) {
    return NextResponse.json(
      { error: 'Missing required fields: file, publicationId, type, fileName' },
      { status: 400 }
    );
  }

  const allowedTypes = ['source', 'edited'];
  if (!allowedTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  // Sanitize filename
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `publications/${publicationId}/${type}/${sanitized}`;

  try {
    const buffer = await file.arrayBuffer();
    const result = await uploadFile(storagePath, buffer, file.type);

    return NextResponse.json({
      url: result.url,
      cdnUrl: result.cdnUrl,
      path: storagePath,
      fileName: sanitized,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
