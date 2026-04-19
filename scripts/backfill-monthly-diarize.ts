/**
 * Backfill biblioteczny — diarize dla sesji z htg2-cdn/HTG-Month/.
 *
 * Flow per sesja:
 *   1. Signed URL via signMedia (backup_storage_path → htg2-cdn) lub signPrivateCdnUrl.
 *   2. Fetch oryginalnego m4a/m4v (może być 70-140 MB).
 *   3. ffmpeg → 24 kbps mono mp3 (zwykle <25 MB dla 2h mowy).
 *   4. diarizeAudio (gpt-4o-transcribe-diarize, chunking_strategy=auto).
 *   5. writeActiveImport (source=archival_diarize, source_job_key=backfill_monthly_<sessionId>).
 *
 * Idempotencja: source_job_key — kolejne wywołanie z tym samym kluczem
 * zwraca istniejący import bez duplikacji (import-writer.ts).
 *
 * Uruchamianie:
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-monthly-diarize.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-monthly-diarize.ts --limit 3
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-monthly-diarize.ts --only <sessionId>
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-monthly-diarize.ts --force  (omija skip gdy jest aktywny import)
 *
 * Wymagania:
 *   - ffmpeg w PATH
 *   - SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENAI_API_KEY
 *   - BUNNY_PRIVATE_CDN_URL, BUNNY_PRIVATE_TOKEN_KEY (dla htg-private pull zone)
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { signMedia } from '../lib/media-signing';
import { transcodeAndChunkWithOverlap } from '../lib/speakers/transcode';
import type { DiarizeSegment } from '../lib/speakers/diarize';
import { writeActiveImport } from '../lib/speakers/import-writer';
import { mergeChunksWithSpeakerMatching, type ChunkResult } from '../lib/speakers/chunk-match';

/** Diarize ma limit 1400 s per request — chunkujemy po 1200 s (20 min) z zapasem. */
const CHUNK_SECONDS = 1200;
/** Overlap na granicy chunka — oba sąsiednie chunki transkrybują tę strefę. */
const OVERLAP_SECONDS = 60;

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Diarize chunk via curl (child_process) — omija Node fetch headersTimeout=300s
 * który uderza gdy OpenAI przetwarza 20 min audio przez 5-8 min.
 */
async function curlDiarize(
  chunkBuf: Buffer,
  apiKey: string,
  language: string,
): Promise<{ segments: DiarizeSegment[]; rawSpeakerCount: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'htg-curl-'));
  const audioPath = join(dir, 'chunk.mp3');
  const responsePath = join(dir, 'response.json');

  try {
    await writeFile(audioPath, chunkBuf);

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('curl', [
        '--silent', '--show-error',
        '--max-time', '780',
        '-X', 'POST',
        OPENAI_TRANSCRIBE_URL,
        '-H', `Authorization: Bearer ${apiKey}`,
        '-F', `file=@${audioPath};type=audio/mpeg`,
        '-F', 'model=gpt-4o-transcribe-diarize',
        '-F', 'response_format=diarized_json',
        '-F', 'chunking_strategy=auto',
        '-F', `language=${language}`,
        '-o', responsePath,
      ]);
      let stderr = '';
      proc.stderr.on('data', (c) => { stderr += c.toString(); });
      proc.on('close', (code) => {
        if (stderr) console.log(`    curl stderr: ${stderr.slice(0, 200)}`);
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) throw new Error(`curl exited ${exitCode}`);

    const raw = await readFile(responsePath, 'utf-8');
    const json = JSON.parse(raw) as {
      error?: { message: string };
      segments?: Array<{
        start?: number; end?: number; speaker?: string; text?: string;
        confidence?: number; avg_logprob?: number;
      }>;
    };

    if (json.error) throw new Error(`OpenAI: ${json.error.message}`);
    if (!Array.isArray(json.segments)) throw new Error('brak segments[] w odpowiedzi');

    const speakerKeys = new Set<string>();
    const segments: DiarizeSegment[] = [];
    for (const s of json.segments) {
      const startSec = typeof s.start === 'number' ? s.start : null;
      const endSec = typeof s.end === 'number' ? s.end : null;
      const speakerKey = typeof s.speaker === 'string' && s.speaker ? s.speaker : null;
      if (startSec === null || endSec === null || endSec <= startSec || !speakerKey) continue;
      speakerKeys.add(speakerKey);
      const confidence =
        typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence))
        : typeof s.avg_logprob === 'number' ? Math.max(0, Math.min(1, Math.exp(s.avg_logprob)))
        : null;
      segments.push({ startSec, endSec, speakerKey, text: (s.text ?? '').trim(), confidence });
    }

    if (segments.length === 0) throw new Error('wszystkie segmenty odfiltrowane');
    return { segments, rawSpeakerCount: speakerKeys.size };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
  only: string | null;
  force: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = { dryRun: false, limit: null, only: null, force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--limit') out.limit = Number(args[++i]);
    else if (a === '--only') out.only = args[++i];
  }
  return out;
}

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Brak env: ${name}`);
    process.exit(1);
  }
  return v;
}

interface SessionRow {
  id: string;
  title: string | null;
  bunny_video_id: string | null;
  bunny_library_id: string | null;
  duration_minutes: number | null;
  media_version: number | null;
}

async function fetchAudioBuffer(url: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} przy pobieraniu`);
  const ab = await res.arrayBuffer();
  const path = url.split('?')[0].toLowerCase();
  const extMatch = path.match(/\.(m4a|m4v|mp4|mp3|wav|ogg|webm|aac)$/);
  const ext = extMatch ? extMatch[1] : 'm4a';
  return { buffer: Buffer.from(ab), ext };
}

async function processSession(
  db: ReturnType<typeof createClient>,
  row: SessionRow,
  force: boolean,
  apiKey: string,
): Promise<{ status: 'done' | 'skipped' | 'failed'; note: string }> {
  const sessionId = row.id;
  // --force → nowy klucz z timestampem, żeby obejść idempotencję import-writera.
  const sourceJobKey = force
    ? `backfill_monthly_${sessionId}_${Date.now()}`
    : `backfill_monthly_${sessionId}`;

  // Skip jeśli już aktywny import (chyba że --force).
  if (!force) {
    const { data } = await db
      .from('session_speaker_imports')
      .select('id')
      .eq('session_template_id', sessionId)
      .eq('is_active', true)
      .maybeSingle();
    const existing = data as { id: string } | null;
    if (existing) {
      return { status: 'skipped', note: `ma aktywny import (id=${existing.id})` };
    }
  }

  if (!row.bunny_video_id) {
    return { status: 'failed', note: 'brak bunny_video_id' };
  }

  const signed = signMedia(
    {
      bunny_video_id: row.bunny_video_id,
      bunny_library_id: row.bunny_library_id,
      backup_storage_path: null,
      media_version: row.media_version ?? 0,
    },
    3600,
  );
  if (!signed || signed.deliveryType !== 'direct') {
    return { status: 'failed', note: `sign failed lub HLS (${signed?.deliveryType})` };
  }

  // 1. Fetch original.
  const fetched = await fetchAudioBuffer(signed.url);
  console.log(`  fetched: ${(fetched.buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // 2. Transcode + nakładające się chunki (overlap dla dopasowania mówców).
  const tr = await transcodeAndChunkWithOverlap(
    fetched.buffer, fetched.ext, CHUNK_SECONDS, OVERLAP_SECONDS,
  );
  console.log(`  chunks: ${tr.chunksBuf.length} × ~${CHUNK_SECONDS}s +${OVERLAP_SECONDS}s overlap (${tr.elapsedMs}ms)`);

  // 3. Diarize każdy chunk (timestampy 0-bazowane z modelu, chunk-match doda offsety).
  const chunkResults: ChunkResult[] = [];
  for (const { chunkBuf, chunkResult } of tr.chunksBuf) {
    let lastErr: unknown = null;
    let result: { segments: DiarizeSegment[]; rawSpeakerCount: number } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await curlDiarize(chunkBuf, apiKey, 'pl');
        break;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`    chunk ${chunkResult.idx} attempt ${attempt}/3 failed: ${msg.slice(0, 120)}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
    if (!result) throw lastErr;
    chunkResults.push({ ...chunkResult, segments: result.segments });
    console.log(`    chunk ${chunkResult.idx}: ${result.segments.length} seg, ${result.rawSpeakerCount} spk, offset=${chunkResult.offsetSec}s`);
  }

  // 4. Dopasowanie mówców między chunkami → kanoniczne klucze A/B/C.
  const allSegments = mergeChunksWithSpeakerMatching(chunkResults, CHUNK_SECONDS, OVERLAP_SECONDS);
  const speakerKeys = new Set(allSegments.map(s => s.speakerKey));

  if (allSegments.length === 0) {
    return { status: 'failed', note: 'wszystkie chunki zwróciły 0 segmentów' };
  }

  // 5. Write import.
  const write = await writeActiveImport({
    db: db as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    sessionTemplateId: sessionId,
    source: 'archival_diarize',
    sourceJobKey,
    sourceRef: row.bunny_video_id,
    createdBy: null,
    segments: allSegments,
  });

  return {
    status: 'done',
    note: `segments=${write.segmentsInserted} speakers=${[...speakerKeys].join(',')} chunks=${tr.chunksBuf.length} importId=${write.importId}`,
  };
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = assertEnv('OPENAI_API_KEY');

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = db
    .from('session_templates')
    .select('id, title, bunny_video_id, bunny_library_id, duration_minutes, media_version')
    .ilike('bunny_video_id', 'HTG-Month/%')
    .order('bunny_video_id', { ascending: true });

  if (args.only) query = query.eq('id', args.only);
  if (args.limit !== null) query = query.limit(args.limit);

  const { data: rows, error } = await query;
  if (error) {
    console.error('❌ DB error:', error.message);
    process.exit(1);
  }

  const sessions = (rows ?? []) as SessionRow[];
  console.log(`\n📋 Znaleziono ${sessions.length} sesji z prefixem HTG-Month/\n`);

  if (args.dryRun) {
    for (const r of sessions) {
      console.log(`  [${r.id}] ${r.title ?? '—'} — ${r.bunny_video_id} (${r.duration_minutes ?? '?'}min)`);
    }
    console.log(`\n✨ Dry-run: ${sessions.length} sesji byłoby przetworzone.`);
    console.log(`   Szacowany koszt OpenAI diarize: ~$${(sessions.length * 0.30).toFixed(2)} przy ~2h sesji.`);
    return;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ id: string; note: string }> = [];

  for (let i = 0; i < sessions.length; i++) {
    const row = sessions[i];
    const prefix = `[${i + 1}/${sessions.length}]`;
    console.log(`${prefix} ${row.id} — ${row.bunny_video_id}`);
    try {
      const res = await processSession(db, row, args.force, apiKey);
      console.log(`  ${res.status === 'done' ? '✅' : res.status === 'skipped' ? '⏭️ ' : '❌'} ${res.note}`);
      if (res.status === 'done') done++;
      else if (res.status === 'skipped') skipped++;
      else { failed++; failures.push({ id: row.id, note: res.note }); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ exception: ${msg}`);
      failed++;
      failures.push({ id: row.id, note: msg });
    }
  }

  console.log(`\n📊 Podsumowanie: done=${done} skipped=${skipped} failed=${failed}`);
  if (failures.length > 0) {
    console.log('\n❌ Błędy:');
    for (const f of failures) console.log(`  ${f.id}: ${f.note}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('💥 Unhandled:', e);
  process.exit(1);
});
