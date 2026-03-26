import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';
import { downloadFile } from '@/lib/bunny-storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;

  const { path } = await params;

  if (!path || path.length < 3) {
    return NextResponse.json(
      { error: 'Invalid path. Expected: {publicationId}/{type}/{fileName}' },
      { status: 400 }
    );
  }

  const [publicationId, type, ...fileNameParts] = path;
  const fileName = fileNameParts.join('/');

  const allowedTypes = ['source', 'edited', 'mastered', 'auto'];
  if (!allowedTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const storagePath = `publications/${publicationId}/${type}/${fileName}`;

  try {
    const { buffer, contentType } = await downloadFile(storagePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
