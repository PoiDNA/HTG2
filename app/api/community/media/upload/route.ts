import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAccess } from '@/lib/community/auth';
import { uploadFile } from '@/lib/bunny-storage';
import { checkCommunityRateLimit } from '@/lib/community/rate-limit';
import crypto from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * POST /api/community/media/upload
 *
 * Upload a file to community media storage.
 * Requires group membership. Validates file type and size server-side.
 *
 * Body: FormData with fields: file, group_id
 * Returns: { path: string } — the Bunny Storage path for use in attachments
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const groupId = formData.get('group_id') as string | null;

  if (!file || !groupId) {
    return NextResponse.json({ error: 'Missing file or group_id' }, { status: 400 });
  }

  // Auth + group membership check
  const auth = await requireGroupAccess(groupId, { requireWrite: true });
  if ('error' in auth) return auth.error;

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate file size (server-side guard against bypassing client compression)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB` },
      { status: 400 }
    );
  }

  // Generate unique filename
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const uniqueId = crypto.randomUUID();
  const storagePath = `community/${groupId}/${uniqueId}.${ext}`;

  try {
    const buffer = await file.arrayBuffer();
    await uploadFile(storagePath, buffer, file.type);

    return NextResponse.json({ path: storagePath });
  } catch (err) {
    console.error('Community media upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
