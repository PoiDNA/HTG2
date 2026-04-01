/**
 * Import historical private session recordings from Bunny Storage.
 *
 * SOURCE: htg2 storage zone → htg-sessions-arch-03-2026/ folder
 *
 * FILENAME FORMAT:
 *   "2025-04-24 20250424 16-00 dubwis25@gmail.com.m4v"
 *   "2025-05-05 m.smieja@o2.pl.m4v"
 *   "2025-05-05 m.smieja@o2.pl2.m4v"  (duplicate suffix)
 *
 * MATCHING:
 *   - Extract email from filename → find user in auth.users
 *   - Extract date (YYYY-MM-DD prefix) → search bookings ±7 days
 *   - >1 booking candidate → manual_review (ambiguous)
 *   - Exactly 1 → exact_email (auto-grant access)
 *
 * Usage:
 *   cd /Users/lk/work/HTG2
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/import-historical-recordings.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/import-historical-recordings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY!;
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'htg2';
const CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://htg2-cdn.b-cdn.net';
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const RETENTION_DAYS = 365;
const BOOKING_DATE_RANGE_DAYS = 7;
const SOURCE_FOLDER = 'htg-sessions-arch-03-2026';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── Bunny Storage list ─────────────────────────────────────────────────────

interface BunnyFile {
  ObjectName: string;
  Length: number;
  LastChanged: string;
  IsDirectory: boolean;
  Path: string;
}

async function listStorageFiles(folder: string): Promise<BunnyFile[]> {
  const url = `https://${STORAGE_HOSTNAME}/${STORAGE_ZONE}/${folder}/`;
  const res = await fetch(url, {
    headers: { AccessKey: STORAGE_API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Storage list failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── Report ─────────────────────────────────────────────────────────────────

interface Report {
  total: number;
  exact_email: { filename: string; email: string; parsed_date: string; booking_id: string; user_id: string }[];
  manual_review: { filename: string; reason: string; parsed_date?: string; parsed_email?: string }[];
  skipped_retention: { filename: string; parsed_date: string }[];
  skipped_duplicate: number;
  errors: { filename: string; error: string }[];
}

const report: Report = {
  total: 0,
  exact_email: [],
  manual_review: [],
  skipped_retention: [],
  skipped_duplicate: 0,
  errors: [],
};

// ── Parsers ────────────────────────────────────────────────────────────────

function parseDate(filename: string): Date | null {
  const m = filename.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    d.setUTCHours(12, 0, 0, 0);
    return d;
  }
  return null;
}

function extractEmail(filename: string): string | null {
  // Match email, allowing trailing digits/parens before extension
  const match = filename.match(/\b([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : null;
}

function safeDateStr(date: Date, offsetDays: number): string {
  const d = new Date(date);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ── User cache ─────────────────────────────────────────────────────────────

let _userCache: Map<string, string> | null = null;

async function getUserIdByEmail(supabase: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  if (!_userCache) {
    _userCache = new Map();
    let page = 1;
    while (true) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !users.length) break;
      for (const u of users) {
        if (u.email) _userCache.set(u.email.toLowerCase(), u.id);
      }
      if (users.length < 1000) break;
      page++;
    }
    console.log(`  Loaded ${_userCache.size} users into email cache`);
  }
  return _userCache.get(email) ?? null;
}

// ── Booking lookup ─────────────────────────────────────────────────────────

interface BookingMatch { id: string; session_type: string; role: 'client' | 'companion' }

async function findBooking(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: Date,
): Promise<BookingMatch | 'ambiguous' | null> {
  const rangeBefore = safeDateStr(date, -BOOKING_DATE_RANGE_DAYS);
  const rangeAfter = safeDateStr(date, BOOKING_DATE_RANGE_DAYS);

  const { data: asClient } = await supabase
    .from('bookings')
    .select('id, session_type, booking_slots!inner(slot_date)')
    .eq('user_id', userId)
    .gte('booking_slots.slot_date', rangeBefore)
    .lte('booking_slots.slot_date', rangeAfter)
    .limit(5);

  const { data: asCompanion } = await supabase
    .from('booking_companions')
    .select('booking_id, bookings!inner(id, session_type, booking_slots!inner(slot_date))')
    .eq('user_id', userId)
    .gte('bookings.booking_slots.slot_date', rangeBefore)
    .lte('bookings.booking_slots.slot_date', rangeAfter)
    .limit(5);

  const candidates: BookingMatch[] = [];
  for (const b of asClient ?? []) {
    candidates.push({ id: b.id, session_type: b.session_type, role: 'client' });
  }
  for (const cr of asCompanion ?? []) {
    const b = cr.bookings as { id: string; session_type: string };
    if (!candidates.some(c => c.id === b.id)) {
      candidates.push({ id: b.id, session_type: b.session_type, role: 'companion' });
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length > 1) return 'ambiguous';
  return candidates[0];
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Import historical recordings ${dryRun ? '(DRY RUN)' : '⚡ LIVE'}`);
  console.log(`Source: ${STORAGE_ZONE}/${SOURCE_FOLDER}`);
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars');
  if (!STORAGE_API_KEY) throw new Error('Missing BUNNY_STORAGE_API_KEY');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 86400000);

  console.log('Listing files from Bunny Storage...');
  const files = await listStorageFiles(SOURCE_FOLDER);
  const audioFiles = files.filter(f => !f.IsDirectory);
  console.log(`  Found ${audioFiles.length} files\n`);

  let processed = 0;
  for (const file of audioFiles) {
    if (processed >= limit) break;
    processed++;
    report.total++;

    const filename = file.ObjectName;
    const cdnPath = `${SOURCE_FOLDER}/${filename}`;

    try {
      // ── Duplicate check ──────────────────────────────────────────
      const { data: existing } = await supabase
        .from('booking_recordings')
        .select('id')
        .eq('import_filename', filename)
        .maybeSingle();

      if (existing) { report.skipped_duplicate++; continue; }

      // ── Parse ────────────────────────────────────────────────────
      const parsedDate = parseDate(filename);
      const parsedEmail = extractEmail(filename);
      const sessionDate = parsedDate ? safeDateStr(parsedDate, 0) : null;

      // ── Retention check ──────────────────────────────────────────
      if (parsedDate && parsedDate < cutoffDate) {
        report.skipped_retention.push({ filename, parsed_date: sessionDate! });
        continue;
      }

      // ── No email or date → manual_review ─────────────────────────
      if (!parsedEmail || !parsedDate) {
        report.manual_review.push({ filename, reason: 'no_email_or_date', parsed_date: sessionDate ?? undefined });
        if (!dryRun) {
          const { data: rec } = await supabase.from('booking_recordings').insert({
            source: 'import', status: 'ready', import_confidence: 'manual_review',
            import_filename: filename, session_date: sessionDate,
            source_url: cdnPath,
            title: `Import — ${sessionDate ?? 'brak daty'}`,
            metadata: { parsed_email: parsedEmail, cdn_path: cdnPath },
          }).select('id').single();
          if (rec) await supabase.from('booking_recording_audit').insert({
            recording_id: rec.id, action: 'import_manual_review', actor_id: SYSTEM_ACTOR,
            details: { reason: 'no_email_or_date', filename },
          });
        }
        continue;
      }

      // ── Find user ───────────────────────────────────────────────
      const userId = await getUserIdByEmail(supabase, parsedEmail);
      if (!userId) {
        report.manual_review.push({ filename, reason: `email_not_found (${parsedEmail})`, parsed_date: sessionDate!, parsed_email: parsedEmail });
        if (!dryRun) {
          const { data: rec } = await supabase.from('booking_recordings').insert({
            source: 'import', status: 'ready', import_confidence: 'manual_review',
            import_filename: filename, session_date: sessionDate,
            source_url: cdnPath,
            title: `Import — ${sessionDate} — ${parsedEmail}`,
            metadata: { parsed_email: parsedEmail, cdn_path: cdnPath },
          }).select('id').single();
          if (rec) await supabase.from('booking_recording_audit').insert({
            recording_id: rec.id, action: 'import_manual_review', actor_id: SYSTEM_ACTOR,
            details: { reason: 'email_not_found', email: parsedEmail, filename },
          });
        }
        continue;
      }

      // ── Find booking ────────────────────────────────────────────
      const booking = await findBooking(supabase, userId, parsedDate);

      if (booking === 'ambiguous') {
        report.manual_review.push({ filename, reason: 'ambiguous_multiple_bookings', parsed_date: sessionDate!, parsed_email: parsedEmail });
        if (!dryRun) {
          const { data: rec } = await supabase.from('booking_recordings').insert({
            source: 'import', status: 'ready', import_confidence: 'manual_review',
            import_filename: filename, session_date: sessionDate,
            source_url: cdnPath,
            title: `Import — ${sessionDate} — ${parsedEmail}`,
            metadata: { parsed_email: parsedEmail, cdn_path: cdnPath, reason: 'ambiguous' },
          }).select('id').single();
          if (rec) await supabase.from('booking_recording_audit').insert({
            recording_id: rec.id, action: 'import_manual_review', actor_id: SYSTEM_ACTOR,
            details: { reason: 'ambiguous_multiple_bookings', email: parsedEmail, filename },
          });
        }
        continue;
      }

      // ── EXACT MATCH (with or without booking) ──────────────────
      // Email is a reliable identifier — grant access even without a booking record.
      const bookingId = booking ? booking.id : null;
      const sessionType = booking ? booking.session_type : null;
      const grantRole = booking?.role === 'companion' ? 'companion' : 'booking_client';

      report.exact_email.push({
        filename, email: parsedEmail, parsed_date: sessionDate!,
        booking_id: bookingId ?? '(no booking)',
        user_id: userId,
      });

      if (!dryRun) {
        const expiresAt = new Date(new Date(sessionDate!).getTime() + RETENTION_DAYS * 86400000).toISOString();
        const { data: rec } = await supabase.from('booking_recordings').insert({
          source: 'import', status: 'ready', import_confidence: 'exact_email',
          import_filename: filename, session_date: sessionDate,
          session_type: sessionType, booking_id: bookingId,
          source_url: cdnPath, expires_at: expiresAt,
          title: `Import — ${sessionDate} — ${parsedEmail}`,
          metadata: { parsed_email: parsedEmail, cdn_path: cdnPath, has_booking: !!bookingId },
        }).select('id').single();

        if (rec) {
          await supabase.from('booking_recording_access').insert({
            recording_id: rec.id, user_id: userId,
            granted_reason: grantRole,
          });
          await supabase.from('booking_recording_audit').insert({
            recording_id: rec.id, action: 'import_matched', actor_id: SYSTEM_ACTOR,
            details: { reason: 'exact_email', email: parsedEmail, booking_id: bookingId, has_booking: !!bookingId },
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      report.errors.push({ filename, error: msg });
      console.error(`  Error: ${filename}: ${msg}`);
    }

    if (processed % 20 === 0) console.log(`  Processed ${processed}/${audioFiles.length}...`);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  writeFileSync('import-report.json', JSON.stringify(report, null, 2));

  console.log('\n=== Import Report ===');
  console.log(`Total:                     ${report.total}`);
  console.log(`→ Matched (exact_email):   ${report.exact_email.length}`);
  console.log(`→ Manual review:           ${report.manual_review.length}`);
  const reasons = report.manual_review.reduce<Record<string, number>>((acc, r) => {
    const key = r.reason.split(' ')[0];
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  for (const [r, c] of Object.entries(reasons)) console.log(`    ${r}: ${c}`);
  console.log(`→ Skipped (retention):     ${report.skipped_retention.length}`);
  console.log(`→ Skipped (duplicate):     ${report.skipped_duplicate}`);
  console.log(`→ Errors:                  ${report.errors.length}`);
  console.log(`\nReport: import-report.json`);
  if (dryRun) console.log('\n(DRY RUN — no records inserted)');
}

main().catch(console.error);
