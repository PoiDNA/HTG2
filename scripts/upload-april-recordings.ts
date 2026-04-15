/**
 * Import April 2026 session recordings into HTG2.
 *
 * Files are already uploaded to Bunny Storage (htg2 zone, folder "HTG Sessions").
 * This script:
 *   1. Creates HTG2 user accounts for emails not yet in auth.users
 *   2. Inserts booking_recordings rows (source='import', recording_phase='sesja', status='ready')
 *   3. Grants booking_recording_access so recordings appear at /konto/nagrania-sesji
 *   4. Writes audit log
 *
 * Source files in Bunny:
 *   htg2 / HTG Sessions / 2026-04-13 danakarol59@gmail.com.m4v
 *   htg2 / HTG Sessions / 2026-04-13 aleksandrawroblewska7@gmail.com.m4v
 *   htg2 / HTG Sessions / 2026-04-14 dominikaszczeplik@gmail.com.m4v
 *   htg2 / HTG Sessions / 2026-04-14 magdalena.witecka@icloud.com.m4v
 *   htg2 / HTG Sessions / 2026-04-15 katarzyna-stasiak83@o2.pl.m4v
 *   htg2 / HTG Sessions / 2026-04-15 wiesiopilarz200@wp.pl.m4v
 *
 * Usage:
 *   cd /Users/lk/work/HTG2
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/upload-april-recordings.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/upload-april-recordings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const STORAGE_FOLDER = 'HTG Sessions';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// ── Session manifest ────────────────────────────────────────────────────────
// Each entry: the file as it exists in Bunny after upload.

interface Session {
  filename: string;       // as stored in Bunny
  sourceUrl: string;      // relative path used as source_url in DB
  sessionDate: string;
  email: string;
  sessionType: string;
}

const SESSIONS: Session[] = [
  {
    filename: '2026-04-13 danakarol59@gmail.com.m4v',
    sourceUrl: 'HTG Sessions/2026-04-13 danakarol59@gmail.com.m4v',
    sessionDate: '2026-04-13',
    email: 'danakarol59@gmail.com',
    sessionType: 'natalia_justyna',
  },
  {
    filename: '2026-04-13 aleksandrawroblewska7@gmail.com.m4v',
    sourceUrl: 'HTG Sessions/2026-04-13 aleksandrawroblewska7@gmail.com.m4v',
    sessionDate: '2026-04-13',
    email: 'aleksandrawroblewska7@gmail.com',
    sessionType: 'natalia_justyna',
  },
  {
    filename: '2026-04-14 dominikaszczeplik@gmail.com.m4v',
    sourceUrl: 'HTG Sessions/2026-04-14 dominikaszczeplik@gmail.com.m4v',
    sessionDate: '2026-04-14',
    email: 'dominikaszczeplik@gmail.com',
    sessionType: 'natalia_solo',
  },
  {
    filename: '2026-04-14 magdalena.witecka@icloud.com.m4v',
    sourceUrl: 'HTG Sessions/2026-04-14 magdalena.witecka@icloud.com.m4v',
    sessionDate: '2026-04-14',
    email: 'magdalena.witecka@icloud.com',
    sessionType: 'natalia_agata',
  },
  {
    filename: '2026-04-15 katarzyna-stasiak83@o2.pl.m4v',
    sourceUrl: 'HTG Sessions/2026-04-15 katarzyna-stasiak83@o2.pl.m4v',
    sessionDate: '2026-04-15',
    email: 'katarzyna-stasiak83@o2.pl',
    sessionType: 'natalia_agata',
  },
  {
    filename: '2026-04-15 wiesiopilarz200@wp.pl.m4v',
    sourceUrl: 'HTG Sessions/2026-04-15 wiesiopilarz200@wp.pl.m4v',
    sessionDate: '2026-04-15',
    email: 'wiesiopilarz200@wp.pl',
    sessionType: 'natalia_agata',
  },
];

// ── User cache ───────────────────────────────────────────────────────────────

let _userCache: Map<string, string> | null = null;

async function loadUserCache(supabase: ReturnType<typeof createClient>) {
  if (_userCache) return;
  _userCache = new Map();
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users?.length) break;
    for (const u of users) {
      if (u.email) _userCache.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < 1000) break;
    page++;
  }
  console.log(`  Cache: ${_userCache.size} użytkowników\n`);
}

async function getOrCreateUser(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; created: boolean }> {
  const existing = _userCache!.get(email.toLowerCase());
  if (existing) return { id: existing, created: false };

  if (dryRun) {
    console.log(`    [DRY RUN] createUser(${email})`);
    return { id: crypto.randomUUID(), created: true };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { created_by: 'import_april_2026' },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const id = data.user.id;
  _userCache!.set(email.toLowerCase(), id);
  return { id, created: true };
}

// ── Booking lookup ───────────────────────────────────────────────────────────

async function findBookingId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<string | null> {
  const before = offsetDate(date, -7);
  const after = offsetDate(date, 7);
  const { data } = await supabase
    .from('bookings')
    .select('id, booking_slots!inner(slot_date)')
    .eq('user_id', userId)
    .in('status', ['confirmed', 'completed'])
    .gte('booking_slots.slot_date', before)
    .lte('booking_slots.slot_date', after)
    .limit(1);
  return data?.[0]?.id ?? null;
}

function offsetDate(d: string, days: number): string {
  const ms = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

// ── Report ───────────────────────────────────────────────────────────────────

interface ReportRow {
  email: string;
  date: string;
  sessionType: string;
  userId: string | null;
  userCreated: boolean;
  bookingId: string | null;
  recordingId: string | null;
  status: 'ok' | 'dry_run' | 'skipped' | 'error';
  error?: string;
}
const report: ReportRow[] = [];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`import-april-recordings ${dryRun ? '(DRY RUN)' : '⚡ LIVE'}`);
  console.log(`Folder Bunny: ${STORAGE_FOLDER}\n`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Brak Supabase env vars');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await loadUserCache(supabase);

  for (const s of SESSIONS) {
    console.log(`──────────────────────────────────────`);
    console.log(`${s.sessionDate}  ${s.email}  [${s.sessionType}]`);

    const row: ReportRow = {
      email: s.email,
      date: s.sessionDate,
      sessionType: s.sessionType,
      userId: null,
      userCreated: false,
      bookingId: null,
      recordingId: null,
      status: 'dry_run',
    };

    try {
      // Duplicate check
      const { data: existing } = await supabase
        .from('booking_recordings')
        .select('id')
        .eq('source_url', s.sourceUrl)
        .maybeSingle();
      if (existing) {
        console.log(`  ⚠ Już istnieje (id=${existing.id}) — pomijam`);
        row.status = 'skipped';
        report.push(row);
        continue;
      }

      // User
      const { id: userId, created } = await getOrCreateUser(supabase, s.email);
      row.userId = userId;
      row.userCreated = created;
      console.log(`  user: ${userId} ${created ? '← NOWE KONTO' : ''}`);

      // Booking (optional)
      const bookingId = await findBookingId(supabase, userId, s.sessionDate);
      row.bookingId = bookingId;
      if (bookingId) console.log(`  booking: ${bookingId}`);

      if (dryRun) {
        console.log(`  [DRY RUN] pominięto INSERT`);
        report.push(row);
        continue;
      }

      // Insert recording
      const recordingId = crypto.randomUUID();
      const { error: recErr } = await supabase
        .from('booking_recordings')
        .insert({
          id: recordingId,
          source: 'import',
          status: 'ready',
          recording_phase: 'sesja',
          import_confidence: 'exact_email',
          import_filename: s.filename,
          session_date: s.sessionDate,
          session_type: s.sessionType,
          booking_id: bookingId,
          source_url: s.sourceUrl,
          backup_storage_path: null,
          backup_storage_zone: null,
          expires_at: null,
          title: `Import — ${s.sessionDate} — ${s.email}`,
          metadata: {
            parsed_email: s.email,
            storage_folder: STORAGE_FOLDER,
            has_booking: !!bookingId,
            import_script: 'upload-april-recordings.ts',
          },
        });
      if (recErr) throw new Error(`INSERT recording: ${recErr.message}`);
      row.recordingId = recordingId;
      console.log(`  recording: ${recordingId}`);

      // Grant access
      const { error: accErr } = await supabase
        .from('booking_recording_access')
        .insert({
          recording_id: recordingId,
          user_id: userId,
          granted_reason: bookingId ? 'booking_client' : 'import_match',
        });
      if (accErr) throw new Error(`INSERT access: ${accErr.message}`);
      console.log(`  dostęp: przyznany (${bookingId ? 'booking_client' : 'import_match'})`);

      // Audit
      await supabase.from('booking_recording_audit').insert({
        recording_id: recordingId,
        action: 'import_matched',
        actor_id: SYSTEM_ACTOR,
        details: {
          reason: 'exact_email',
          email: s.email,
          booking_id: bookingId,
          session_type: s.sessionType,
          source_url: s.sourceUrl,
          script: 'upload-april-recordings.ts',
        },
      });

      row.status = 'ok';
      console.log(`  ✓ OK`);
    } catch (err) {
      row.status = 'error';
      row.error = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${row.error}`);
    }

    report.push(row);
  }

  // Summary
  console.log('\n=== Podsumowanie ===');
  console.log(`OK:          ${report.filter(r => r.status === 'ok').length}`);
  console.log(`Pominięte:   ${report.filter(r => r.status === 'skipped').length}`);
  console.log(`Dry run:     ${report.filter(r => r.status === 'dry_run').length}`);
  console.log(`Błędy:       ${report.filter(r => r.status === 'error').length}`);
  console.log(`Nowe konta:  ${report.filter(r => r.userCreated).length}`);
  for (const r of report.filter(r => r.userCreated)) {
    console.log(`  • ${r.email} (${r.userId})`);
  }

  writeFileSync('upload-april-report.json', JSON.stringify(report, null, 2));
  console.log('\nRaport: upload-april-report.json');
  if (dryRun) console.log('\n(DRY RUN — żadnych zmian w DB)');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
