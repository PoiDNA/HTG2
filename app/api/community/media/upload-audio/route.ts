import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAccess } from '@/lib/community/auth';
import { uploadFile } from '@/lib/bunny-storage';
import crypto from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for audio
const ALLOWED_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'];

/**
 * POST /api/community/media/upload-audio
 *
 * Upload an audio file (voice note) to community media storage.
 * Body: FormData with fields: file, group_id
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const groupId = formData.get('group_id') as string | null;

  if (!file || !groupId) {
    return NextResponse.json({ error: 'Missing file or group_id' }, { status: 400 });
  }

  const auth = await requireGroupAccess(groupId, { requireWrite: true });
  if ('error' in auth) return auth.error;

  // Validate type
  if (!ALLOWED_TYPES.some(t => file.type.startsWith(t.split('/')[0]))) {
    return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 });
  }

  const ext = file.type.includes('webm') ? 'webm' : file.type.includes('mp4') ? 'm4a' : 'ogg';
  const uniqueId = crypto.randomUUID();
  const storagePath = `community/${groupId}/audio/${uniqueId}.${ext}`;

  try {
    const buffer = await file.arrayBuffer();
    await uploadFile(storagePath, buffer, file.type);
    return NextResponse.json({ path: storagePath });
  } catch (err) {
    console.error('Audio upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
