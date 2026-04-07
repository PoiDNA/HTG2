import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { listFiles } from '@/lib/bunny-storage';
import {
  FOLDER_ALLOWLIST, isAudioVideoFile,
  parseDate, extractEmail, inferSessionType,
} from '@/lib/recording-import';

/**
 * POST /api/admin/scan-bunny
 * Step 1: Read-only scan of Bunny Storage folders for new recording files.
 * Returns list of new files with parsed metadata (no DB writes).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedFolders: string[] = body.folders || FOLDER_ALLOWLIST;

  // Validate folders against allowlist
  const folders = requestedFolders.filter(f => FOLDER_ALLOWLIST.includes(f));
  if (folders.length === 0) {
    return NextResponse.json({ error: 'Brak dozwolonych folderów' }, { status: 400 });
  }

  // List files from Bunny Storage
  const allFiles: Array<{ sourceUrl: string; filename: string; folder: string; fileSize: number }> = [];
  for (const folder of folders) {
    try {
      const files = await listFiles(folder);
      for (const f of files) {
        if (f.IsDirectory) continue;
        if (!isAudioVideoFile(f.ObjectName)) continue;
        allFiles.push({
          sourceUrl: `${folder}/${f.ObjectName}`,
          filename: f.ObjectName,
          folder,
          fileSize: f.Length ?? 0,
        });
      }
    } catch (err) {
      console.error(`scan-bunny: failed to list ${folder}:`, err);
    }
  }

  // Get all existing source_urls from DB (paginated)
  const db = createSupabaseServiceRole();
  const existingUrls = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await db
      .from('booking_recordings')
      .select('source_url')
      .not('source_url', 'is', null)
      .order('created_at')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) existingUrls.add(r.source_url);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Filter new files and parse metadata
  const newFiles = [];
  let skippedCount = 0;
  for (const file of allFiles) {
    if (existingUrls.has(file.sourceUrl)) {
      skippedCount++;
      continue;
    }
    newFiles.push({
      ...file,
      parsedEmail: extractEmail(file.filename),
      parsedDate: parseDate(file.filename),
      inferredSessionType: inferSessionType(file.filename),
    });
  }

  // Warn if Bunny might have truncated results
  for (const folder of folders) {
    const count = allFiles.filter(f => f.folder === folder).length;
    if (count >= 1000) {
      console.warn(`scan-bunny: folder ${folder} returned ${count} files — may be truncated by Bunny API`);
    }
  }

  return NextResponse.json({
    newFiles,
    skippedCount,
    totalScanned: allFiles.length,
    folders,
  });
}
