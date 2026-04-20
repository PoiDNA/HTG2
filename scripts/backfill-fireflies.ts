/**
 * Backfill diarize przez Fireflies.ai API dla sesji HTG-Month/.
 *
 * Flow per sesja:
 *   1. Signed URL Bunny (3h) — oryginalny m4v, bez transkodowania.
 *   2. uploadAudio → Fireflies pobiera plik sam.
 *   3. Poll transcripts co 30s aż sentences > 0.
 *   4. Mapuj speaker_id (0,1,2…) → A,B,C.
 *   5. writeActiveImport (source=fireflies_diarize).
 *
 * Uruchamianie:
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-fireflies.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-fireflies.ts --limit 3
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-fireflies.ts --only <sessionId>
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-fireflies.ts --force
 */

import { createClient } from '@supabase/supabase-js';
import { signMedia } from '../lib/media-signing';
import { writeActiveImport } from '../lib/speakers/import-writer';
import type { DiarizeSegment } from '../lib/speakers/diarize';

const FF_API = 'https://api.fireflies.ai/graphql';
const POLL_INTERVAL_MS = 30_000;
const MAX_POLLS = 80; // 40 min max
const SPEAKER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`❌ Brak env: ${name}`); process.exit(1); }
  return v;
}

async function ffGql(query: string, variables: Record<string, unknown>, apiKey: string) {
  const res = await fetch(FF_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Fireflies GQL: ${json.errors[0].message}`);
  return json.data ?? {};
}

async function uploadAudio(url: string, title: string, apiKey: string) {
  const data = await ffGql(`
    mutation UploadAudio($input: AudioUploadInput) {
      uploadAudio(input: $input) { success title message }
    }
  `, { input: { url, title, custom_language: 'pl' } }, apiKey);
  return data['uploadAudio'] as { success: boolean; message: string };
}

async function findAndFetchTranscript(title: string, apiKey: string): Promise<DiarizeSegment[] | null> {
  // Szukaj po tytule w ostatnich 50 uploadach.
  const data = await ffGql(`
    query { transcripts(limit: 50) { id title } }
  `, {}, apiKey);
  const list = (data['transcripts'] as Array<{ id: string; title: string }>) ?? [];
  const found = list.find((t) => t.title === title);
  if (!found) return null;

  // Pobierz sentences — jeśli puste, jeszcze przetwarza.
  const tData = await ffGql(`
    query Transcript($id: String!) {
      transcript(id: $id) {
        sentences { speaker_id start_time end_time text }
      }
    }
  `, { id: found.id }, apiKey);
  const sentences = (tData['transcript'] as { sentences: Array<{ speaker_id: number; start_time: number; end_time: number; text: string }> } | null)?.sentences;
  if (!sentences || sentences.length === 0) return null;

  // Mapuj speaker_id → A, B, C…
  const idToLetter = new Map<number, string>();
  // Sortuj po pierwszym wystąpieniu żeby A = kto mówi pierwszy.
  for (const s of sentences) {
    if (!idToLetter.has(s.speaker_id)) {
      idToLetter.set(s.speaker_id, SPEAKER_LETTERS[idToLetter.size] ?? `spk${s.speaker_id}`);
    }
  }

  return sentences.map((s) => ({
    startSec: s.start_time,
    endSec: s.end_time,
    speakerKey: idToLetter.get(s.speaker_id) ?? 'A',
    text: s.text,
    confidence: null,
  }));
}

interface CliArgs { dryRun: boolean; limit: number | null; only: string | null; force: boolean }

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = { dryRun: false, limit: null, only: null, force: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') out.dryRun = true;
    else if (args[i] === '--force') out.force = true;
    else if (args[i] === '--limit') out.limit = Number(args[++i]);
    else if (args[i] === '--only') out.only = args[++i];
  }
  return out;
}

interface SessionRow {
  id: string; title: string | null;
  bunny_video_id: string | null; bunny_library_id: string | null;
  media_version: number | null;
}

async function processSession(
  db: ReturnType<typeof createClient>,
  row: SessionRow,
  force: boolean,
  apiKey: string,
): Promise<{ status: 'done' | 'skipped' | 'failed'; note: string }> {
  const sourceJobKey = force
    ? `fireflies_monthly_${row.id}_${Date.now()}`
    : `fireflies_monthly_${row.id}`;

  if (!force) {
    const { data } = await db
      .from('session_speaker_imports')
      .select('id')
      .eq('session_template_id', row.id)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return { status: 'skipped', note: `ma aktywny import (id=${(data as { id: string }).id})` };
  }

  if (!row.bunny_video_id) return { status: 'failed', note: 'brak bunny_video_id' };

  const signed = signMedia({
    bunny_video_id: row.bunny_video_id,
    bunny_library_id: row.bunny_library_id,
    backup_storage_path: null,
    media_version: row.media_version ?? 0,
  }, 10800);

  if (!signed || signed.deliveryType !== 'direct') {
    return { status: 'failed', note: `sign failed (${signed?.deliveryType})` };
  }

  const title = `htg-ff-${row.id}`;

  // 1. Upload.
  const upload = await uploadAudio(signed.url, title, apiKey);
  if (!upload.success) return { status: 'failed', note: `upload failed: ${upload.message}` };
  console.log(`  uploaded → queued`);

  // 2. Poll.
  let segments: DiarizeSegment[] | null = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    segments = await findAndFetchTranscript(title, apiKey);
    if (segments) {
      console.log(`  processed po ${(i + 1) * 30}s`);
      break;
    }
    if ((i + 1) % 4 === 0) console.log(`  czekam… ${(i + 1) * 30}s`);
  }

  if (!segments) return { status: 'failed', note: 'timeout — Fireflies nie przetworzyło w 40 min' };

  const speakers = [...new Set(segments.map((s) => s.speakerKey))];

  // 3. Write import.
  const write = await writeActiveImport({
    db: db as Parameters<typeof writeActiveImport>[0]['db'],
    sessionTemplateId: row.id,
    source: 'fireflies_diarize',
    sourceJobKey,
    sourceRef: row.bunny_video_id,
    createdBy: null,
    segments,
  });

  return {
    status: 'done',
    note: `segments=${write.segmentsInserted} speakers=${speakers.join(',')} importId=${write.importId}`,
  };
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = assertEnv('FIREFLIES_API_KEY');

  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let query = db
    .from('session_templates')
    .select('id, title, bunny_video_id, bunny_library_id, media_version')
    .ilike('bunny_video_id', 'HTG-Month/%.m4v')
    .order('bunny_video_id', { ascending: true });

  if (args.only) query = query.eq('id', args.only);
  if (args.limit !== null) query = query.limit(args.limit);

  const { data: rows, error } = await query;
  if (error) { console.error('❌ DB error:', error.message); process.exit(1); }

  const sessions = (rows ?? []) as SessionRow[];
  console.log(`\n📋 Znaleziono ${sessions.length} sesji HTG-Month/*.m4v\n`);

  if (args.dryRun) {
    for (const r of sessions) console.log(`  [${r.id}] ${r.title ?? '—'} — ${r.bunny_video_id}`);
    console.log(`\n✨ Dry-run: ${sessions.length} sesji.`);
    return;
  }

  let done = 0, skipped = 0, failed = 0;
  const failures: Array<{ id: string; note: string }> = [];

  for (let i = 0; i < sessions.length; i++) {
    const row = sessions[i];
    console.log(`[${i + 1}/${sessions.length}] ${row.id} — ${row.bunny_video_id}`);
    try {
      const res = await processSession(db, row, args.force, apiKey);
      const icon = res.status === 'done' ? '✅' : res.status === 'skipped' ? '⏭️ ' : '❌';
      console.log(`  ${icon} ${res.note}`);
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

  console.log(`\n📊 done=${done} skipped=${skipped} failed=${failed}`);
  if (failures.length > 0) {
    console.log('\n❌ Błędy:');
    for (const f of failures) console.log(`  ${f.id}: ${f.note}`);
    process.exit(2);
  }
}

main().catch((e) => { console.error('💥 Unhandled:', e); process.exit(1); });
