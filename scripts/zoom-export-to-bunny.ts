/**
 * Export ALL Zoom Cloud Recordings → Bunny Storage zone "htg2".
 *
 * Pulls every recording_file (MP4 video, M4A audio, separate per-speaker audio,
 * chat, transcript, summary, timeline, CC) for every user on the Zoom account,
 * across the full date range, and uploads to:
 *
 *   /zoom-archive/<YYYY>/<YYYY-MM-DD>/<meeting_id>/<recording_type>-<recording_id>.<ext>
 *
 * Writes a manifest JSON with full Zoom metadata for later DB mapping.
 *
 * Auth: Zoom Server-to-Server OAuth (account_credentials grant).
 * Required scopes:
 *   - cloud_recording:read:list_account_recordings:admin
 *   - cloud_recording:read:recording:admin
 *   - user:read:list_users:admin
 *
 * Required env (in .env.local):
 *   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *   BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE (default htg2)
 *
 * Usage:
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/zoom-export-to-bunny.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/zoom-export-to-bunny.ts --from=2025-01-01 --to=2025-12-31
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/zoom-export-to-bunny.ts --user=lk@htg.cyou
 */

import { createWriteStream, createReadStream, mkdirSync, existsSync, statSync, appendFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────

const ZOOM_ACCOUNT_ID = required('ZOOM_ACCOUNT_ID');
const ZOOM_CLIENT_ID = required('ZOOM_CLIENT_ID');
const ZOOM_CLIENT_SECRET = required('ZOOM_CLIENT_SECRET');

const STORAGE_API_KEY = required('BUNNY_STORAGE_API_KEY');
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'htg2';

const ARCHIVE_PREFIX = 'zoom-archive';
const OUTPUT_DIR = join(process.cwd(), 'scripts', 'output');
const MANIFEST_PATH = join(OUTPUT_DIR, 'zoom-export-manifest.json');
const LOG_PATH = join(OUTPUT_DIR, 'zoom-export.log');

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return v;
}

// ── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
const userArg = args.find(a => a.startsWith('--user='))?.split('=')[1];
const typesArg = args.find(a => a.startsWith('--types='))?.split('=')[1];
const allowedTypes = typesArg ? new Set(typesArg.split(',').map(s => s.toLowerCase())) : null;

const FROM_DATE = fromArg || '2020-01-01';
const TO_DATE = toArg || new Date().toISOString().slice(0, 10);

// ── Logging ───────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + '\n');
}

// ── Zoom OAuth ────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getZoomToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new Error(`Zoom OAuth failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function zoomGet<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  const token = await getZoomToken();
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const url = `https://api.zoom.us/v2${path}${qs ? `?${qs}` : ''}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || '5');
      log(`Zoom 429 — sleeping ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (res.status >= 500) {
      log(`Zoom ${res.status} on ${path} — backoff ${attempt + 1}`);
      await sleep((attempt + 1) * 2000);
      continue;
    }
    throw new Error(`Zoom GET ${path} failed (${res.status}): ${await res.text()}`);
  }
  throw new Error(`Zoom GET ${path} failed after retries`);
}

// ── Types ─────────────────────────────────────────────────────────────────

interface ZoomUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: string;
  file_extension: string;
  file_size: number;
  download_url: string;
  status: string;
  recording_type?: string;
}

interface ZoomMeeting {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  total_size: number;
  host_email?: string;
  recording_files?: ZoomRecordingFile[];
  participant_audio_files?: ZoomRecordingFile[];
}

// ── Zoom listing ──────────────────────────────────────────────────────────

async function listAllUsers(): Promise<ZoomUser[]> {
  const users: ZoomUser[] = [];
  let next_page_token: string | undefined;
  do {
    const data = await zoomGet<{ users: ZoomUser[]; next_page_token?: string }>('/users', {
      page_size: 300,
      status: 'active',
      ...(next_page_token ? { next_page_token } : {}),
    });
    users.push(...data.users);
    next_page_token = data.next_page_token || undefined;
  } while (next_page_token);

  // also include inactive (former) users, recordings persist
  next_page_token = undefined;
  do {
    const data = await zoomGet<{ users: ZoomUser[]; next_page_token?: string }>('/users', {
      page_size: 300,
      status: 'inactive',
      ...(next_page_token ? { next_page_token } : {}),
    });
    users.push(...data.users);
    next_page_token = data.next_page_token || undefined;
  } while (next_page_token);

  return users;
}

/** Iterate date range in ≤30-day chunks (Zoom API cap). */
function* monthlyWindows(from: string, to: string): Generator<{ from: string; to: string }> {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  let cursor = new Date(start);
  while (cursor <= end) {
    const winEnd = new Date(cursor);
    winEnd.setUTCDate(winEnd.getUTCDate() + 29);
    if (winEnd > end) winEnd.setTime(end.getTime());
    yield {
      from: cursor.toISOString().slice(0, 10),
      to: winEnd.toISOString().slice(0, 10),
    };
    cursor = new Date(winEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

async function listUserMeetings(userId: string, from: string, to: string): Promise<ZoomMeeting[]> {
  const all: ZoomMeeting[] = [];
  let next_page_token: string | undefined;
  do {
    const data = await zoomGet<{ meetings: ZoomMeeting[]; next_page_token?: string }>(
      `/users/${userId}/recordings`,
      {
        from,
        to,
        page_size: 300,
        ...(next_page_token ? { next_page_token } : {}),
      }
    );
    all.push(...(data.meetings || []));
    next_page_token = data.next_page_token || undefined;
  } while (next_page_token);
  return all;
}

/** Fetch full meeting recording details including participant_audio_files. */
async function getMeetingRecordings(meetingUuid: string): Promise<ZoomMeeting | null> {
  // Zoom requires double-encoding only when UUID starts with "/" or contains "//"
  const needsDouble = meetingUuid.startsWith('/') || meetingUuid.includes('//');
  const encoded = needsDouble
    ? encodeURIComponent(encodeURIComponent(meetingUuid))
    : encodeURIComponent(meetingUuid);
  try {
    const result = await zoomGet<ZoomMeeting>(`/meetings/${encoded}/recordings`);
    const audioCount = result.participant_audio_files?.length ?? 0;
    if (audioCount > 0) log(`      → ${audioCount} participant audio file(s)`);
    return result;
  } catch (e) {
    log(`      ! getMeetingRecordings failed for ${meetingUuid}: ${(e as Error).message}`);
    return null;
  }
}

// ── Bunny ────────────────────────────────────────────────────────────────

function bunnyUrl(path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${clean}`;
}

async function bunnyHead(path: string): Promise<{ exists: boolean; size?: number }> {
  // Bunny Storage doesn't support HEAD reliably — use GET with Range: bytes=0-0
  const res = await fetch(bunnyUrl(path), {
    method: 'GET',
    headers: { AccessKey: STORAGE_API_KEY, Range: 'bytes=0-0' },
  });
  if (res.status === 404) return { exists: false };
  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`Bunny HEAD failed (${res.status}) on ${path}`);
  }
  // Content-Range: bytes 0-0/12345  → total = part after "/"
  const cr = res.headers.get('content-range');
  let size: number | undefined;
  if (cr) {
    const m = cr.match(/\/(\d+)$/);
    if (m) size = Number(m[1]);
  } else {
    const cl = res.headers.get('content-length');
    if (cl) size = Number(cl);
  }
  // drain body
  await res.arrayBuffer().catch(() => {});
  return { exists: true, size };
}

async function bunnyUploadFromFile(path: string, localFile: string, contentLength: number): Promise<void> {
  const stream = createReadStream(localFile);
  const res = await fetch(bunnyUrl(path), {
    method: 'PUT',
    headers: {
      AccessKey: STORAGE_API_KEY,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(contentLength),
    },
    // @ts-expect-error duplex required for streaming body in Node fetch
    duplex: 'half',
    body: Readable.toWeb(stream) as ReadableStream,
  });
  if (!res.ok) {
    throw new Error(`Bunny upload failed (${res.status}) on ${path}: ${await res.text()}`);
  }
}

// ── Zoom download ────────────────────────────────────────────────────────

async function downloadZoomFile(downloadUrl: string, destPath: string): Promise<number> {
  const token = await getZoomToken();
  const url = downloadUrl.includes('?')
    ? `${downloadUrl}&access_token=${token}`
    : `${downloadUrl}?access_token=${token}`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Zoom download failed (${res.status}): ${downloadUrl}`);
  }
  if (!res.body) throw new Error('Zoom download: empty body');

  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
  return statSync(destPath).size;
}

// ── Path computation ─────────────────────────────────────────────────────

function safeSegment(s: string): string {
  const pl: Record<string, string> = {
    ą:'a',ć:'c',ę:'e',ł:'l',ń:'n',ó:'o',ś:'s',ź:'z',ż:'z',
    Ą:'A',Ć:'C',Ę:'E',Ł:'L',Ń:'N',Ó:'O',Ś:'S',Ź:'Z',Ż:'Z',
  };
  return s
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, c => pl[c] ?? c)
    .replace(/[^a-zA-Z0-9._@-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

function bunnyPathForFile(meeting: ZoomMeeting, file: ZoomRecordingFile): string {
  const date = (file.recording_start || meeting.start_time || '').slice(0, 10);
  const year = date.slice(0, 4);
  // Use meeting topic as folder name (original Zoom name), fall back to meeting ID
  const folderName = meeting.topic ? safeSegment(meeting.topic) : String(meeting.id);
  const recType = safeSegment(file.recording_type || file.file_type || 'file');
  // Use file_extension if present, otherwise derive from file_type (e.g. M4A → m4a)
  const ext = (file.file_extension || file.file_type || 'bin').toLowerCase();
  return `${ARCHIVE_PREFIX}/${year}/${date}/${folderName}/${recType}-${file.id}.${ext}`;
}

function shouldKeep(file: ZoomRecordingFile): boolean {
  if (!allowedTypes) return true;
  const ext = (file.file_extension || '').toLowerCase();
  const ft = (file.file_type || '').toLowerCase();
  return allowedTypes.has(ext) || allowedTypes.has(ft);
}

// ── Main ─────────────────────────────────────────────────────────────────

interface ManifestEntry {
  user_id: string;
  user_email: string;
  meeting_uuid: string;
  meeting_id: string;
  topic: string;
  start_time: string;
  duration: number;
  host_email?: string;
  recording_id: string;
  recording_type?: string;
  file_type: string;
  file_extension: string;
  file_size: number;
  recording_start: string;
  recording_end: string;
  bunny_path: string;
  status: 'uploaded' | 'skipped_existing' | 'dry_run' | 'failed';
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  log(`Zoom → Bunny export starting`);
  log(`Range: ${FROM_DATE} → ${TO_DATE}`);
  log(`Filter user: ${userArg || '(all)'}`);
  log(`Filter types: ${typesArg || '(all)'}`);
  log(`Dry run: ${dryRun}`);
  log(`Bunny zone: ${STORAGE_ZONE}, prefix: ${ARCHIVE_PREFIX}/`);

  log('Listing Zoom users…');
  const allUsers = await listAllUsers();
  const users = userArg ? allUsers.filter(u => u.email.toLowerCase() === userArg.toLowerCase()) : allUsers;
  log(`Users to process: ${users.length} (of ${allUsers.length} total)`);
  if (users.length === 0) {
    log('No matching users — exiting.');
    return;
  }

  const manifest: ManifestEntry[] = [];
  let totalFiles = 0;
  let totalBytes = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    log(`\n=== User ${user.email} (${user.id}) ===`);
    for (const win of monthlyWindows(FROM_DATE, TO_DATE)) {
      let meetings: ZoomMeeting[] = [];
      try {
        meetings = await listUserMeetings(user.id, win.from, win.to);
      } catch (e) {
        log(`  ! list ${win.from}..${win.to} failed: ${(e as Error).message}`);
        continue;
      }
      if (meetings.length === 0) continue;
      log(`  ${win.from}..${win.to}: ${meetings.length} meetings`);

      for (const meetingSummary of meetings) {
        // Fetch full recording details — list endpoint omits participant_audio_files
        const meeting = (await getMeetingRecordings(meetingSummary.uuid)) || meetingSummary;
        const files = [
          ...(meeting.recording_files || []),
          ...(meeting.participant_audio_files || []),
        ];
        for (const file of files) {
          if (file.status && file.status !== 'completed') continue;
          if (!shouldKeep(file)) continue;
          if (!file.download_url) continue;

          totalFiles++;
          totalBytes += file.file_size || 0;

          const bunnyPath = bunnyPathForFile(meeting, file);
          const entry: ManifestEntry = {
            user_id: user.id,
            user_email: user.email,
            meeting_uuid: meeting.uuid,
            meeting_id: String(meeting.id),
            topic: meeting.topic,
            start_time: meeting.start_time,
            duration: meeting.duration,
            host_email: meeting.host_email,
            recording_id: file.id,
            recording_type: file.recording_type,
            file_type: file.file_type,
            file_extension: file.file_extension,
            file_size: file.file_size,
            recording_start: file.recording_start,
            recording_end: file.recording_end,
            bunny_path: bunnyPath,
            status: 'dry_run',
          };

          if (dryRun) {
            manifest.push(entry);
            continue;
          }

          try {
            const head = await bunnyHead(bunnyPath);
            if (head.exists && head.size && file.file_size && head.size === file.file_size) {
              entry.status = 'skipped_existing';
              skipped++;
              log(`    SKIP ${bunnyPath} (already ${head.size}B)`);
              manifest.push(entry);
              continue;
            }

            const tmpFile = join(tmpdir(), `zoom-${randomUUID()}.${file.file_extension || 'bin'}`);
            try {
              const downloadedSize = await downloadZoomFile(file.download_url, tmpFile);
              await bunnyUploadFromFile(bunnyPath, tmpFile, downloadedSize);
              entry.status = 'uploaded';
              entry.file_size = downloadedSize;
              uploaded++;
              log(`    UP   ${bunnyPath} (${downloadedSize}B)`);
            } finally {
              try { (await import('fs/promises')).unlink(tmpFile).catch(() => {}); } catch { /* noop */ }
            }
          } catch (err) {
            entry.status = 'failed';
            entry.error = (err as Error).message;
            failed++;
            log(`    FAIL ${bunnyPath}: ${(err as Error).message}`);
          }
          manifest.push(entry);

          // Persist manifest incrementally so we don't lose progress on long runs
          if (manifest.length % 25 === 0) {
            writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
          }
        }
      }
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  log('');
  log('═══ SUMMARY ═══');
  log(`Files seen     : ${totalFiles}`);
  log(`Total size est : ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
  log(`Uploaded       : ${uploaded}`);
  log(`Skipped (dup)  : ${skipped}`);
  log(`Failed         : ${failed}`);
  log(`Manifest       : ${MANIFEST_PATH}`);
  if (dryRun) log('(dry-run — nothing was uploaded)');
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
