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

import { createClient } from '@supabase/supabase-js';
import { signMedia } from '../lib/media-signing';
import { transcodeToLowMp3 } from '../lib/speakers/transcode';
import { diarizeAudio, MAX_FILE_SIZE } from '../lib/speakers/diarize';
import { writeActiveImport } from '../lib/speakers/import-writer';

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
): Promise<{ status: 'done' | 'skipped' | 'failed'; note: string }> {
  const sessionId = row.id;
  const sourceJobKey = `backfill_monthly_${sessionId}`;

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

  // 2. Transcode jeśli za duży.
  let uploadBuffer: Buffer;
  let uploadExt: string;
  let uploadMime: string;
  if (fetched.buffer.byteLength > MAX_FILE_SIZE) {
    const tr = await transcodeToLowMp3(fetched.buffer, fetched.ext);
    uploadBuffer = tr.mp3Buffer;
    uploadExt = 'mp3';
    uploadMime = 'audio/mpeg';
    console.log(
      `  transcode: ${(tr.originalBytes / 1024 / 1024).toFixed(1)} MB → ` +
      `${(tr.outputBytes / 1024 / 1024).toFixed(1)} MB (${tr.elapsedMs}ms)`,
    );
    if (uploadBuffer.byteLength > MAX_FILE_SIZE) {
      return {
        status: 'failed',
        note: `nawet po transcode >25 MB (${(uploadBuffer.byteLength / 1024 / 1024).toFixed(1)} MB) — sesja dłuższa niż ~2h30m`,
      };
    }
  } else {
    uploadBuffer = fetched.buffer;
    uploadExt = fetched.ext;
    uploadMime = fetched.ext === 'm4a' || fetched.ext === 'mp4' || fetched.ext === 'm4v'
      ? 'audio/mp4'
      : 'audio/mpeg';
  }

  // 3. Diarize.
  const result = await diarizeAudio({
    audioBuffer: uploadBuffer.buffer.slice(
      uploadBuffer.byteOffset,
      uploadBuffer.byteOffset + uploadBuffer.byteLength,
    ) as ArrayBuffer,
    sourceUrl: signed.url,
    language: 'pl',
    explicitMime: uploadMime,
    explicitExt: uploadExt,
  });

  // 4. Write import.
  const write = await writeActiveImport({
    db: db as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    sessionTemplateId: sessionId,
    source: 'archival_diarize',
    sourceJobKey,
    sourceRef: row.bunny_video_id,
    createdBy: null,
    segments: result.segments,
  });

  return {
    status: 'done',
    note: `segments=${write.segmentsInserted} speakers=${result.rawSpeakerCount} importId=${write.importId}`,
  };
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  assertEnv('OPENAI_API_KEY');

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
      const res = await processSession(db, row, args.force);
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
