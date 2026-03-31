/**
 * Link Bunny Stream videos to session_templates within monthly packages.
 *
 * PROBLEM:
 *   - session_templates in monthly_sets have bunny_video_id = NULL
 *   - Bunny library has videos titled "HTG CYOU 2025-05-01" (one per session)
 *   - Need to write bunny_video_id + bunny_library_id into session_templates
 *
 * FILENAME FORMAT (Bunny title):
 *   "HTG CYOU 2025-05-01"  →  month: 2025-05, day: 01
 *   "HTG CYOU 2025-05-1"   →  same (leading zero optional)
 *
 * MATCHING LOGIC:
 *   1. Read all HTG CYOU videos from Bunny, group by YYYY-MM
 *   2. For each month: find monthly_set by month_label = 'YYYY-MM'
 *   3. Get sessions for that set ordered by sort_order ASC
 *   4. Sort videos for that month by day ASC
 *   5. Match positionally: video[0] → sort_order-lowest session, etc.
 *   6. Auto-link only when count(videos) === count(sessions) — flag others
 *
 * SAFETY:
 *   - Skips session_templates that already have bunny_video_id set
 *   - Dry-run by default: shows what would happen, writes nothing
 *   - Only links in perfect-count months; flags mismatches for manual review
 *
 * Usage:
 *   # Show what would be linked (safe, no writes):
 *   BUNNY_VOD_LIBRARY_ID=abc123 npx tsx scripts/link-package-recordings.ts --dry-run
 *
 *   # Actually write bunny_video_id to session_templates:
 *   BUNNY_VOD_LIBRARY_ID=abc123 npx tsx scripts/link-package-recordings.ts
 *
 *   # Use BUNNY_LIBRARY_ID if VOD and recordings share one library:
 *   npx tsx scripts/link-package-recordings.ts --dry-run
 *
 *   # Override library at runtime:
 *   npx tsx scripts/link-package-recordings.ts --library-id=abc123 --dry-run
 *
 *   # Limit to one month (for testing):
 *   npx tsx scripts/link-package-recordings.ts --month=2025-05 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { listVideos } from '../lib/bunny-stream';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// VOD library for subscription content — separate from BUNNY_LIBRARY_ID (personal recordings)
const DEFAULT_LIBRARY_ID = process.env.BUNNY_VOD_LIBRARY_ID ?? process.env.BUNNY_LIBRARY_ID!;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const libraryArg = args.find(a => a.startsWith('--library-id='));
const libraryId = libraryArg ? libraryArg.split('=')[1] : DEFAULT_LIBRARY_ID;
const monthFilter = args.find(a => a.startsWith('--month='))?.split('=')[1] ?? null; // e.g. '2025-05'

// ── Types ──────────────────────────────────────────────────────────────────

interface BunnyVideoEntry {
  guid: string;
  title: string;
  month: string;   // 'YYYY-MM'
  day: number;     // 1-31, for ordering within month
  length: number | null;
}

interface SessionInSet {
  session_id: string;
  sort_order: number;
  session_title: string;
  bunny_video_id: string | null;  // current value — null = needs linking
}

interface MonthGroup {
  monthLabel: string;            // 'YYYY-MM'
  setId: string;
  setTitle: string;
  sessions: SessionInSet[];
  videos: BunnyVideoEntry[];
}

interface LinkCandidate {
  session_id: string;
  session_title: string;
  bunny_video_id: string;        // guid to write
  bunny_library_id: string;
  month: string;
  set_title: string;
}

interface Report {
  linked: LinkCandidate[];
  skipped_already_linked: { session_id: string; session_title: string; existing_bunny_id: string }[];
  mismatched_months: {
    month: string;
    set_title: string;
    video_count: number;
    session_count: number;
    videos: string[];
    sessions: string[];
    note: string;
  }[];
  months_no_set: { month: string; video_titles: string[] }[];
  non_htg_cyou_skipped: number;
  errors: { context: string; error: string }[];
}

const report: Report = {
  linked: [],
  skipped_already_linked: [],
  mismatched_months: [],
  months_no_set: [],
  non_htg_cyou_skipped: 0,
  errors: [],
};

// ── Parsers ────────────────────────────────────────────────────────────────

/**
 * Returns { month: 'YYYY-MM', day: N } if title matches "HTG CYOU YYYY-MM-D(D)".
 * Returns null for any other format.
 */
function parseHtgCyouTitle(title: string): { month: string; day: number } | null {
  // Match: "HTG CYOU 2025-05-1" or "HTG CYOU 2025-05-01"
  const m = title.match(/^HTG\s+CYOU\s+(\d{4})-(\d{2})-(\d{1,2})(?:\s|$)/i);
  if (!m) return null;
  const year = m[1];
  const month = m[2];
  const day = parseInt(m[3], 10);
  if (parseInt(month) < 1 || parseInt(month) > 12) return null;
  if (day < 1 || day > 31) return null;
  return { month: `${year}-${month}`, day };
}

// ── DB queries ─────────────────────────────────────────────────────────────

interface SetWithSessions {
  id: string;
  title: string;
  month_label: string;
  sessions: SessionInSet[];
}

async function getSetWithSessions(
  supabase: ReturnType<typeof createClient>,
  monthLabel: string,
): Promise<SetWithSessions | null> {
  const { data: sets, error } = await supabase
    .from('monthly_sets')
    .select('id, title, month_label')
    .eq('month_label', monthLabel)
    .eq('is_published', false)  // include unpublished
    .or('is_published.eq.true,is_published.eq.false') // actually fetch all
    .limit(2);

  if (error) {
    report.errors.push({ context: `getSet(${monthLabel})`, error: error.message });
    return null;
  }

  // Try without is_published filter if no results
  const { data: setsAll } = await supabase
    .from('monthly_sets')
    .select('id, title, month_label')
    .eq('month_label', monthLabel)
    .limit(2);

  const found = setsAll ?? [];

  if (found.length === 0) return null;
  if (found.length > 1) {
    report.errors.push({
      context: `getSet(${monthLabel})`,
      error: `Multiple monthly_sets found for month_label='${monthLabel}' — ambiguous, skipping`,
    });
    return null;
  }

  const set = found[0];

  // Get sessions in this set, ordered by sort_order
  const { data: setSessionRows, error: ssErr } = await supabase
    .from('set_sessions')
    .select(`
      sort_order,
      session:session_templates(id, title, bunny_video_id)
    `)
    .eq('set_id', set.id)
    .order('sort_order', { ascending: true });

  if (ssErr) {
    report.errors.push({ context: `getSessions(${set.id})`, error: ssErr.message });
    return null;
  }

  const sessions: SessionInSet[] = (setSessionRows ?? []).map((row: {
    sort_order: number;
    session: { id: string; title: string; bunny_video_id: string | null } | null;
  }) => ({
    session_id: row.session?.id ?? '',
    sort_order: row.sort_order,
    session_title: row.session?.title ?? '(unknown)',
    bunny_video_id: row.session?.bunny_video_id ?? null,
  })).filter(s => s.session_id);

  return { id: set.id, title: set.title, month_label: set.month_label, sessions };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Link package recordings to session_templates ${dryRun ? '(DRY RUN)' : '⚡ LIVE'}`);
  console.log(`Library: ${libraryId}${monthFilter ? `, Month filter: ${monthFilter}` : ''}`);
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!libraryId) {
    throw new Error(
      'No library ID found. Set BUNNY_VOD_LIBRARY_ID (or BUNNY_LIBRARY_ID) env var, ' +
      'or pass --library-id=xxx'
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── 1. Fetch all videos from Bunny ───────────────────────────────────────
  console.log('Fetching videos from Bunny...');
  const allVideos: BunnyVideoEntry[] = [];
  let page = 1;
  while (true) {
    const { items } = await listVideos(libraryId, page, 100);
    if (!items.length) break;
    for (const v of items) {
      const title = v.title ?? v.guid;
      const parsed = parseHtgCyouTitle(title);
      if (!parsed) {
        report.non_htg_cyou_skipped++;
        continue;
      }
      if (monthFilter && parsed.month !== monthFilter) continue;
      allVideos.push({ guid: v.guid, title, month: parsed.month, day: parsed.day, length: v.length ?? null });
    }
    if (items.length < 100) break;
    page++;
  }
  console.log(`  Found ${allVideos.length} HTG CYOU videos${monthFilter ? ` in ${monthFilter}` : ''}`);
  console.log(`  Skipped ${report.non_htg_cyou_skipped} non-HTG-CYOU videos`);
  console.log('');

  // ── 2. Group videos by month ─────────────────────────────────────────────
  const byMonth = new Map<string, BunnyVideoEntry[]>();
  for (const v of allVideos) {
    if (!byMonth.has(v.month)) byMonth.set(v.month, []);
    byMonth.get(v.month)!.push(v);
  }

  // Sort each month's videos by day ascending
  for (const [, videos] of byMonth) {
    videos.sort((a, b) => a.day - b.day);
  }

  const months = [...byMonth.keys()].sort();
  console.log(`Processing ${months.length} distinct month(s): ${months.join(', ')}`);
  console.log('');

  // ── 3. Match each month to a monthly_set ────────────────────────────────
  for (const month of months) {
    const videos = byMonth.get(month)!;
    const set = await getSetWithSessions(supabase, month);

    if (!set) {
      console.log(`  ⚠️  ${month}: No monthly_set found in DB — skipping`);
      report.months_no_set.push({ month, video_titles: videos.map(v => v.title) });
      continue;
    }

    const sessionsNeedingLink = set.sessions.filter(s => !s.bunny_video_id);
    const sessionsAlreadyLinked = set.sessions.filter(s => s.bunny_video_id);

    console.log(`  📦 ${month} — "${set.title}"`);
    console.log(`     DB sessions: ${set.sessions.length} (${sessionsNeedingLink.length} unlinked, ${sessionsAlreadyLinked.length} already linked)`);
    console.log(`     Bunny videos: ${videos.length}`);

    // Record already-linked sessions
    for (const s of sessionsAlreadyLinked) {
      report.skipped_already_linked.push({
        session_id: s.session_id,
        session_title: s.session_title,
        existing_bunny_id: s.bunny_video_id!,
      });
    }

    // Check count match (only for sessions that need linking)
    if (videos.length !== sessionsNeedingLink.length) {
      const note = videos.length === set.sessions.length && sessionsAlreadyLinked.length > 0
        ? `All sessions already linked — nothing to do`
        : `Count mismatch: ${videos.length} videos vs ${sessionsNeedingLink.length} unlinked sessions — manual review required`;

      console.log(`     ⚠️  ${note}`);

      if (!(videos.length === 0 && sessionsNeedingLink.length === 0)) {
        report.mismatched_months.push({
          month,
          set_title: set.title,
          video_count: videos.length,
          session_count: sessionsNeedingLink.length,
          videos: videos.map(v => `${v.title} (guid: ${v.guid})`),
          sessions: sessionsNeedingLink.map(s => `sort_order=${s.sort_order}: ${s.session_title}`),
          note,
        });
      }
      continue;
    }

    if (sessionsNeedingLink.length === 0) {
      console.log(`     ✅ All sessions already linked — skipping`);
      continue;
    }

    // ── Perfect match: link positionally ──────────────────────────────────
    for (let i = 0; i < sessionsNeedingLink.length; i++) {
      const session = sessionsNeedingLink[i];
      const video = videos[i];

      const candidate: LinkCandidate = {
        session_id: session.session_id,
        session_title: session.session_title,
        bunny_video_id: video.guid,
        bunny_library_id: libraryId,
        month,
        set_title: set.title,
      };

      console.log(`     ${dryRun ? '→' : '✓'} sort_order=${session.sort_order} "${session.session_title}"`);
      console.log(`       ← Bunny day=${video.day}: "${video.title}" (${video.guid})`);

      report.linked.push(candidate);

      if (!dryRun) {
        const { error } = await supabase
          .from('session_templates')
          .update({
            bunny_video_id: video.guid,
            bunny_library_id: libraryId,
          })
          .eq('id', session.session_id);

        if (error) {
          console.error(`     ❌ Update failed: ${error.message}`);
          report.errors.push({ context: `update(${session.session_id})`, error: error.message });
        }
      }
    }
    console.log('');
  }

  // ── 4. Report ────────────────────────────────────────────────────────────
  const reportPath = 'link-package-report.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=== Link Package Recordings Report ===');
  console.log(`Videos linked (or would be):     ${report.linked.length}`);
  console.log(`Sessions already linked (skip):  ${report.skipped_already_linked.length}`);
  console.log(`Months not found in DB:          ${report.months_no_set.length}`);
  if (report.months_no_set.length) {
    for (const m of report.months_no_set) {
      console.log(`  - ${m.month}: ${m.video_titles.join(', ')}`);
    }
  }
  console.log(`Mismatched months (manual):      ${report.mismatched_months.length}`);
  if (report.mismatched_months.length) {
    for (const m of report.mismatched_months) {
      console.log(`  - ${m.month} "${m.set_title}": ${m.note}`);
    }
  }
  console.log(`Errors:                          ${report.errors.length}`);
  if (report.errors.length) {
    for (const e of report.errors) console.log(`  - ${e.context}: ${e.error}`);
  }
  console.log(`\nFull report: ${reportPath}`);
  if (dryRun) {
    console.log('\n⚠️  DRY RUN — nothing written to DB.');
    console.log('   Remove --dry-run to apply.');
  } else {
    console.log(`\n✅ Done. ${report.linked.length} session_templates updated.`);
  }
}

main().catch(console.error);
