/**
 * Link Bunny Storage files from HTG-Month/ to session_templates in monthly_sets.
 *
 * SOURCE: htg2 storage zone → HTG-Month/ folder
 *
 * FILENAME FORMAT (variable, but always starts with "HTG CYOU YYYY-MM-DD"):
 *   "HTG CYOU 2024-05-01  htg_wingmakers_v1 (1080p).m4v"
 *   "HTG CYOU 2025-01-1_-_miłość_źródłowa... (1080p).m4v"  (day without leading zero)
 *   "HTG CYOU 2025-06-1.m4v"  (minimal)
 *
 * MATCHING:
 *   - Parse YYYY-MM from filename → find monthly_set by month_label
 *   - Parse day number → sort by day ascending
 *   - Match positionally to sessions sorted by sort_order in set_sessions
 *   - Only auto-link when video count === unlinked session count
 *
 * WHAT IT WRITES:
 *   session_templates.bunny_video_id = CDN path (e.g. "HTG-Month/HTG CYOU 2024-05-01 ...")
 *   (NOT bunny_video_id — that's for Bunny Stream Video, we use Storage)
 *
 * Usage:
 *   cd /Users/lk/work/HTG2
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/link-package-recordings.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/link-package-recordings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY!;
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'htg2';
const CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://htg2-cdn.b-cdn.net';
const SOURCE_FOLDER = 'HTG-Month';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const monthFilter = args.find(a => a.startsWith('--month='))?.split('=')[1] ?? null;

// ── Bunny Storage ──────────────────────────────────────────────────────────

interface BunnyFile {
  ObjectName: string;
  Length: number;
  IsDirectory: boolean;
}

async function listStorageFiles(folder: string): Promise<BunnyFile[]> {
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${folder}/`;
  const res = await fetch(url, {
    headers: { AccessKey: STORAGE_API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Storage list failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ParsedVideo {
  filename: string;
  month: string;       // 'YYYY-MM'
  sessionNum: number;  // session number in package (01=S1, 02=S2, etc.)
  cdnPath: string;     // 'HTG-Month/filename'
  sizeMB: number;
}

interface SessionInSet {
  session_id: string;
  sort_order: number;
  session_title: string;
  sessionNum: number | null;  // extracted from title "S1 - ...", "S2 - ..."
  bunny_video_id: string | null;
}

interface LinkCandidate {
  session_id: string;
  session_title: string;
  cdnPath: string;
  filename: string;
  month: string;
}

interface Report {
  linked: LinkCandidate[];
  skipped_already_linked: { session_id: string; session_title: string }[];
  mismatched_months: { month: string; set_title: string; video_count: number; session_count: number; note: string }[];
  months_no_set: { month: string; filenames: string[] }[];
  non_htg_skipped: number;
  errors: { context: string; error: string }[];
}

const report: Report = {
  linked: [],
  skipped_already_linked: [],
  mismatched_months: [],
  months_no_set: [],
  non_htg_skipped: 0,
  errors: [],
};

// ── Parser ─────────────────────────────────────────────────────────────────

function parseHtgTitle(filename: string): { month: string; sessionNum: number } | null {
  // "HTG CYOU 2024-05-01 ..." → month=2024-05, sessionNum=1
  // "HTG CYOU 2025-01-3_-_..." → month=2025-01, sessionNum=3
  const m = filename.match(/^HTG\s+CYOU\s+(\d{4})-(\d{2})-(\d{1,2})/i);
  if (!m) return null;
  const month = `${m[1]}-${m[2]}`;
  const sessionNum = parseInt(m[3], 10);
  if (sessionNum < 1 || sessionNum > 20) return null;
  return { month, sessionNum };
}

/** Extract session number from title like "S1 - Rozmowa ze Źródłem" → 1 */
function extractSessionNum(title: string): number | null {
  const m = title.match(/^S(\d+)\s/);
  return m ? parseInt(m[1], 10) : null;
}

// ── DB ─────────────────────────────────────────────────────────────────────

async function getSetWithSessions(
  supabase: ReturnType<typeof createClient>,
  monthLabel: string,
): Promise<{ id: string; title: string; sessions: SessionInSet[] } | null> {
  const { data: sets } = await supabase
    .from('monthly_sets')
    .select('id, title, month_label')
    .eq('month_label', monthLabel)
    .limit(2);

  if (!sets || sets.length === 0) return null;
  if (sets.length > 1) {
    report.errors.push({ context: `getSet(${monthLabel})`, error: 'Multiple sets for same month_label' });
    return null;
  }

  const set = sets[0];
  const { data: rows } = await supabase
    .from('set_sessions')
    .select('sort_order, session:session_templates(id, title, bunny_video_id)')
    .eq('set_id', set.id)
    .order('sort_order', { ascending: true });

  const sessions: SessionInSet[] = (rows ?? []).map((r: any) => ({
    session_id: r.session?.id ?? '',
    sort_order: r.sort_order,
    session_title: r.session?.title ?? '(unknown)',
    sessionNum: extractSessionNum(r.session?.title ?? ''),
    bunny_video_id: r.session?.bunny_video_id ?? null,
  })).filter((s: SessionInSet) => s.session_id);

  return { id: set.id, title: set.title, sessions };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Link package recordings ${dryRun ? '(DRY RUN)' : '⚡ LIVE'}`);
  console.log(`Source: ${STORAGE_ZONE}/${SOURCE_FOLDER}`);
  if (monthFilter) console.log(`Month filter: ${monthFilter}`);
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars');
  if (!STORAGE_API_KEY) throw new Error('Missing BUNNY_STORAGE_API_KEY');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── 1. List files ────────────────────────────────────────────────────────
  console.log('Listing files from Bunny Storage...');
  const allFiles = await listStorageFiles(SOURCE_FOLDER);
  const videos: ParsedVideo[] = [];

  for (const f of allFiles) {
    if (f.IsDirectory) continue;
    const parsed = parseHtgTitle(f.ObjectName);
    if (!parsed) { report.non_htg_skipped++; continue; }
    if (monthFilter && parsed.month !== monthFilter) continue;
    videos.push({
      filename: f.ObjectName,
      month: parsed.month,
      sessionNum: parsed.sessionNum,
      cdnPath: `${SOURCE_FOLDER}/${f.ObjectName}`,
      sizeMB: Math.round(f.Length / 1024 / 1024),
    });
  }

  console.log(`  Found ${videos.length} HTG CYOU files${monthFilter ? ` in ${monthFilter}` : ''}`);
  console.log(`  Skipped ${report.non_htg_skipped} non-HTG files\n`);

  // ── 2. Group by month ────────────────────────────────────────────────────
  const byMonth = new Map<string, ParsedVideo[]>();
  for (const v of videos) {
    if (!byMonth.has(v.month)) byMonth.set(v.month, []);
    byMonth.get(v.month)!.push(v);
  }
  for (const [, vids] of byMonth) vids.sort((a, b) => a.sessionNum - b.sessionNum);

  const months = [...byMonth.keys()].sort();
  console.log(`Processing ${months.length} months: ${months.join(', ')}\n`);

  // ── 3. Match ─────────────────────────────────────────────────────────────
  for (const month of months) {
    const vids = byMonth.get(month)!;
    const set = await getSetWithSessions(supabase, month);

    if (!set) {
      console.log(`  ⚠️  ${month}: No monthly_set found → skipping`);
      report.months_no_set.push({ month, filenames: vids.map(v => v.filename) });
      continue;
    }

    const needsLink = set.sessions.filter(s => !s.bunny_video_id);
    const alreadyLinked = set.sessions.filter(s => s.bunny_video_id);

    console.log(`  📦 ${month} — "${set.title}"`);
    console.log(`     Sessions: ${set.sessions.length} (${needsLink.length} unlinked, ${alreadyLinked.length} linked)`);
    console.log(`     Files: ${vids.length}`);

    for (const s of alreadyLinked) {
      report.skipped_already_linked.push({ session_id: s.session_id, session_title: s.session_title });
    }

    if (needsLink.length === 0) {
      console.log(`     ✅ All linked\n`);
      continue;
    }

    // ── Match by session number (file S1 → title "S1 - ...") ──────────
    const unmatched: ParsedVideo[] = [];
    for (const video of vids) {
      // Find session with matching number
      const session = needsLink.find(s => s.sessionNum === video.sessionNum);

      if (!session) {
        unmatched.push(video);
        console.log(`     ⚠️  No session S${video.sessionNum} in DB for "${video.filename}"`);
        continue;
      }

      if (session.bunny_video_id) {
        // Already linked (by a previous video in this run or before)
        continue;
      }

      console.log(`     ${dryRun ? '→' : '✓'} S${video.sessionNum} "${session.session_title}"`);
      console.log(`       ← "${video.filename}" (${video.sizeMB}MB)`);

      report.linked.push({
        session_id: session.session_id,
        session_title: session.session_title,
        cdnPath: video.cdnPath,
        filename: video.filename,
        month,
      });

      if (!dryRun) {
        const { error } = await supabase
          .from('session_templates')
          .update({ bunny_video_id: video.cdnPath })
          .eq('id', session.session_id);

        if (error) {
          console.error(`     ❌ Update failed: ${error.message}`);
          report.errors.push({ context: `update(${session.session_id})`, error: error.message });
        }
      }
    }

    if (unmatched.length > 0) {
      report.mismatched_months.push({
        month, set_title: set.title,
        video_count: unmatched.length,
        session_count: 0,
        note: `${unmatched.length} file(s) with no matching session number: ${unmatched.map(u => `S${u.sessionNum}`).join(', ')}`,
      });
    }
    console.log('');
  }

  // ── 4. Report ────────────────────────────────────────────────────────────
  writeFileSync('link-package-report.json', JSON.stringify(report, null, 2));

  console.log('=== Link Report ===');
  console.log(`Linked (or would be):      ${report.linked.length}`);
  console.log(`Already linked (skip):     ${report.skipped_already_linked.length}`);
  console.log(`Months not in DB:          ${report.months_no_set.length}`);
  if (report.months_no_set.length) {
    for (const m of report.months_no_set) console.log(`  - ${m.month} (${m.filenames.length} files)`);
  }
  console.log(`Mismatched months:         ${report.mismatched_months.length}`);
  if (report.mismatched_months.length) {
    for (const m of report.mismatched_months) console.log(`  - ${m.month}: ${m.note}`);
  }
  console.log(`Errors:                    ${report.errors.length}`);
  console.log(`\nReport: link-package-report.json`);
  if (dryRun) console.log('\n(DRY RUN — no records updated)');
}

main().catch(console.error);
