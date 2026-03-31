/**
 * Import historical recordings from Bunny Stream.
 *
 * SUPPORTED FILENAME FORMATS (client recordings):
 *
 *   Format A — with email (preferred, enables auto-match):
 *     "20260217 12-00 karminak@wp.pl Karolina Klimkiewicz"
 *     → exact_email confidence, auto-grants access if booking found
 *
 *   Format B — name only (legacy):
 *     "Sesja 1-1 20260319 Paulina Matykiewicz"
 *     "Sesja Para 20260115 Jan Kowalski Anna Kowalska"
 *     "Asysta 20251205 Maria Nowak"
 *     → manual_review, admin assigns via admin panel
 *
 * SKIPPED (VOD subscription content):
 *   "HTG CYOU 2025-12-05 s5_-_dla_kogo_jest_twój_spektakl.mp4"
 *   "HTG CYOU 2025-05-01 Sesja 1 - Pakiet Maj 2025"
 *
 * Usage:
 *   npx tsx scripts/import-historical-recordings.ts --dry-run
 *   npx tsx scripts/import-historical-recordings.ts --library-id=abc123
 *   npx tsx scripts/import-historical-recordings.ts --limit=50
 */

import { createClient } from '@supabase/supabase-js';
import { listVideos } from '../lib/bunny-stream';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID!;
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const RETENTION_DAYS = 365;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const libraryArg = args.find(a => a.startsWith('--library-id='));
const libraryId = libraryArg ? libraryArg.split('=')[1] : BUNNY_LIBRARY_ID;

// ── Report types ───────────────────────────────────────────────────────────

interface ExactEmailItem {
  filename: string;
  email: string;
  parsed_date: string;
  booking_id: string;
  user_id: string;
  session_type: string;
}

interface ManualReviewItem {
  filename: string;
  parsed_date?: string;
  parsed_name?: string;
  parsed_session_type?: string;
  reason: string;  // why it fell to manual_review
}

interface SkippedRetentionItem {
  filename: string;
  parsed_date: string;
}

interface Report {
  total: number;
  exact_email: ExactEmailItem[];
  manual_review: ManualReviewItem[];
  skipped_vod: number;
  skipped_retention: SkippedRetentionItem[];
  skipped_duplicate: number;
  errors: { filename: string; error: string }[];
}

const report: Report = {
  total: 0,
  exact_email: [],
  manual_review: [],
  skipped_vod: 0,
  skipped_retention: [],
  skipped_duplicate: 0,
  errors: [],
};

// ── VOD filter ─────────────────────────────────────────────────────────────

function isVodSubscription(title: string): boolean {
  return title.startsWith('HTG CYOU') || /s\d+_-_/.test(title);
}

// ── Parsers ────────────────────────────────────────────────────────────────

function parseDate(text: string): Date | null {
  // YYYYMMDD (no separators) — primary format
  const compact = text.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compact) {
    const year = parseInt(compact[1]);
    const month = parseInt(compact[2]);
    const day = parseInt(compact[3]);
    if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // YYYY-MM-DD
  const dashFmt = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashFmt) {
    const year = parseInt(dashFmt[1]);
    const month = parseInt(dashFmt[2]);
    const day = parseInt(dashFmt[3]);
    if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // DD.MM.YYYY
  const dotFmt = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotFmt) {
    const day = parseInt(dotFmt[1]);
    const month = parseInt(dotFmt[2]);
    const year = parseInt(dotFmt[3]);
    if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  return null;
}

/** Extract email address from filename, case-normalised. */
function extractEmail(title: string): string | null {
  const match = title.match(/\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/);
  return match ? match[0].toLowerCase() : null;
}

const SESSION_TYPE_HINTS: Record<string, string[]> = {
  natalia_solo: ['sesja 1-1', '1na1', '1:1', 'indywidualna', 'solo'],
  natalia_para: ['sesja para', 'para', 'couple', 'pary'],
  natalia_asysta: ['asysta', 'asyst'],
};

function inferSessionType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [type, hints] of Object.entries(SESSION_TYPE_HINTS)) {
    if (hints.some(h => lower.includes(h))) return type;
  }
  return null;
}

function extractClientName(title: string): string {
  let name = title;
  name = name.replace(/\.\w{2,4}$/, '');       // extension
  name = name.replace(/\b\d{8}\b/g, '');        // YYYYMMDD
  name = name.replace(/\d{4}-\d{2}-\d{2}/g, ''); // YYYY-MM-DD
  name = name.replace(/\d{2}\.\d{2}\.\d{4}/g, ''); // DD.MM.YYYY
  name = name.replace(/\b\d{2}[-:]\d{2}\b/g, ''); // HH-MM or HH:MM time
  name = name.replace(/\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g, ''); // email
  for (const hints of Object.values(SESSION_TYPE_HINTS)) {
    for (const h of hints) {
      const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      name = name.replace(new RegExp(escaped, 'gi'), '');
    }
  }
  return name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── User email cache ───────────────────────────────────────────────────────

let _userEmailCache: Map<string, string> | null = null;

/**
 * Returns auth user_id for a given email.
 * Loads all users once into memory — acceptable for a one-time import script.
 */
async function getUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  if (!_userEmailCache) {
    _userEmailCache = new Map();
    let page = 1;
    while (true) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error || !users.length) break;
      for (const u of users) {
        if (u.email) _userEmailCache.set(u.email.toLowerCase(), u.id);
      }
      if (users.length < 1000) break;
      page++;
    }
    console.log(`  Loaded ${_userEmailCache.size} users into email cache`);
  }
  return _userEmailCache.get(email) ?? null;
}

// ── Booking lookup ─────────────────────────────────────────────────────────

interface BookingMatch {
  id: string;
  session_type: string;
  /** 'client' = main booker, 'companion' = partner in para */
  role: 'client' | 'companion';
}

/**
 * Find booking for a user on a specific date.
 * Checks both as main booker and as companion.
 * Returns null if not found or ambiguous.
 *
 * ASSUMPTION: bookings.user_id = main booker's user_id
 * ASSUMPTION: booking_companions.booking_id + user_id for para partners
 * ASSUMPTION: booking_slots.booking_id + slot_date for session date
 */
async function findBookingByUserAndDate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: Date,
  sessionType: string | null,
): Promise<BookingMatch | null> {
  const dateStr = date.toISOString().slice(0, 10);

  // Check as main booker
  const q = supabase
    .from('bookings')
    .select('id, session_type, booking_slots!inner(slot_date)')
    .eq('user_id', userId)
    .eq('booking_slots.slot_date', dateStr)
    .limit(2);

  const { data: asClient } = sessionType
    ? await q.eq('session_type', sessionType)
    : await q;

  if (asClient && asClient.length === 1) {
    return { id: asClient[0].id, session_type: asClient[0].session_type, role: 'client' };
  }
  if (asClient && asClient.length > 1) {
    // Ambiguous — multiple sessions same day for same user (shouldn't happen)
    return null;
  }

  // Check as companion (para sessions only)
  const { data: companionRows } = await supabase
    .from('booking_companions')
    .select('booking_id, bookings!inner(id, session_type, booking_slots!inner(slot_date))')
    .eq('user_id', userId)
    .eq('bookings.booking_slots.slot_date', dateStr)
    .limit(2);

  if (companionRows && companionRows.length === 1) {
    const b = companionRows[0].bookings as { id: string; session_type: string };
    return { id: b.id, session_type: b.session_type, role: 'companion' };
  }

  return null;
}

/** For para sessions, find the companion's user_id (the other participant). */
async function findCompanionUserId(
  supabase: ReturnType<typeof createClient>,
  bookingId: string,
  excludeUserId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('booking_companions')
    .select('user_id')
    .eq('booking_id', bookingId)
    .neq('user_id', excludeUserId)
    .not('user_id', 'is', null)
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

// ── Booking lookup (informational only — for manual_review metadata) ────────

async function findSuggestedBookings(
  supabase: ReturnType<typeof createClient>,
  parsedDate: Date,
  parsedSessionType: string | null,
): Promise<string[]> {
  const threeDaysBefore = new Date(parsedDate.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const threeDaysAfter = new Date(parsedDate.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  const query = supabase
    .from('bookings')
    .select('id, session_type, booking_slots!inner(slot_date)')
    .gte('booking_slots.slot_date', threeDaysBefore)
    .lte('booking_slots.slot_date', threeDaysAfter);

  const { data: bookings } = parsedSessionType
    ? await query.eq('session_type', parsedSessionType).limit(10)
    : await query.limit(10);

  return (bookings ?? []).map((b: { id: string }) => b.id);
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function insertRecording(
  supabase: ReturnType<typeof createClient>,
  payload: {
    bunnyVideoId: string;
    libraryId: string;
    filename: string;
    sessionDate: string | null;
    sessionType: string | null;
    bookingId: string | null;
    confidence: 'exact_email' | 'manual_review';
    parsedName: string | null;
    parsedEmail: string | null;
    durationSeconds: number | null;
    suggestedBookings?: string[];
    manualReason?: string;
  },
): Promise<string | null> {
  const expiresAt = payload.sessionDate
    ? new Date(new Date(payload.sessionDate).getTime() + RETENTION_DAYS * 86400000).toISOString()
    : null;

  const titleParts = [
    'Import',
    payload.sessionDate,
    payload.parsedName || null,
  ].filter(Boolean);

  const { data: rec, error } = await supabase
    .from('booking_recordings')
    .insert({
      bunny_video_id: payload.bunnyVideoId,
      bunny_library_id: payload.libraryId,
      session_date: payload.sessionDate,
      session_type: payload.sessionType,
      booking_id: payload.bookingId,
      source: 'import',
      status: 'ready',
      import_filename: payload.filename,
      import_confidence: payload.confidence,
      expires_at: expiresAt,
      duration_seconds: payload.durationSeconds,
      title: titleParts.join(' — '),
      metadata: {
        parsed_name: payload.parsedName,
        parsed_email: payload.parsedEmail,
        parsed_session_type: payload.sessionType,
        suggested_bookings: payload.suggestedBookings ?? [],
        manual_reason: payload.manualReason ?? null,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  Insert error for ${payload.filename}:`, error.message);
    report.errors.push({ filename: payload.filename, error: error.message });
    return null;
  }
  return rec?.id ?? null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Import historical recordings ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`Library: ${libraryId}, Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  if (!libraryId) {
    throw new Error('Missing BUNNY_LIBRARY_ID env var (or --library-id=xxx argument)');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 86400000);

  let page = 1;
  let processed = 0;

  while (processed < limit) {
    const { items, totalItems } = await listVideos(libraryId, page, 100);
    if (!items.length) break;

    console.log(`Page ${page}: ${items.length} videos (total in library: ${totalItems})`);

    for (const video of items) {
      if (processed >= limit) break;
      processed++;
      report.total++;

      const filename = video.title ?? video.guid;

      try {
        // ── Skip VOD subscription videos ──────────────────────────────
        if (isVodSubscription(filename)) {
          report.skipped_vod++;
          continue;
        }

        // ── Skip duplicates ───────────────────────────────────────────
        const { data: existing } = await supabase
          .from('booking_recordings')
          .select('id')
          .eq('import_filename', filename)
          .maybeSingle();

        if (existing) {
          report.skipped_duplicate++;
          continue;
        }

        // ── Parse filename ────────────────────────────────────────────
        const parsedDate = parseDate(filename);
        const parsedEmail = extractEmail(filename);
        const parsedSessionType = inferSessionType(filename);
        const parsedName = extractClientName(filename);

        // ── Skip old recordings (>365 days) ──────────────────────────
        if (parsedDate && parsedDate < cutoffDate) {
          report.skipped_retention.push({
            filename,
            parsed_date: parsedDate.toISOString().slice(0, 10),
          });
          continue;
        }

        const sessionDate = parsedDate?.toISOString().slice(0, 10) ?? null;

        // ══════════════════════════════════════════════════════════════
        // PATH A: email present → try exact_email matching
        // ══════════════════════════════════════════════════════════════
        if (parsedEmail && parsedDate) {
          const userId = await getUserIdByEmail(supabase, parsedEmail);

          if (userId) {
            const booking = await findBookingByUserAndDate(
              supabase,
              userId,
              parsedDate,
              parsedSessionType,
            );

            if (booking) {
              // ── EXACT MATCH ──────────────────────────────────────
              report.exact_email.push({
                filename,
                email: parsedEmail,
                parsed_date: sessionDate!,
                booking_id: booking.id,
                user_id: userId,
                session_type: booking.session_type,
              });

              if (!dryRun) {
                const recId = await insertRecording(supabase, {
                  bunnyVideoId: video.guid,
                  libraryId,
                  filename,
                  sessionDate,
                  sessionType: booking.session_type,
                  bookingId: booking.id,
                  confidence: 'exact_email',
                  parsedName: parsedName || null,
                  parsedEmail,
                  durationSeconds: video.length ?? null,
                });

                if (recId) {
                  // Grant access to matched user
                  const matchedRole = booking.role === 'companion' ? 'companion' : 'booking_client';
                  await supabase.from('booking_recording_access').insert({
                    recording_id: recId,
                    user_id: userId,
                    granted_reason: matchedRole,
                  });

                  // For para: also grant to the other participant if they have an account
                  if (booking.session_type === 'natalia_para') {
                    const companionId = await findCompanionUserId(supabase, booking.id, userId);
                    if (companionId) {
                      await supabase.from('booking_recording_access').insert({
                        recording_id: recId,
                        user_id: companionId,
                        granted_reason: booking.role === 'companion' ? 'booking_client' : 'companion',
                      });
                    }
                  }

                  await supabase.from('booking_recording_audit').insert({
                    recording_id: recId,
                    action: 'import_matched',
                    actor_id: SYSTEM_ACTOR,
                    details: {
                      reason: 'exact_email',
                      email: parsedEmail,
                      booking_id: booking.id,
                      role: booking.role,
                    },
                  });
                }
              }
              continue; // processed as exact_email
            }

            // User found but no booking on that date
            // Fall through to manual_review with helpful context
            const manualReason = `user_found_no_booking (user_id: ${userId})`;
            report.manual_review.push({
              filename,
              parsed_date: sessionDate ?? undefined,
              parsed_name: parsedName || undefined,
              parsed_session_type: parsedSessionType ?? undefined,
              reason: manualReason,
            });

            if (!dryRun) {
              const suggestedBookings = await findSuggestedBookings(supabase, parsedDate, parsedSessionType);
              const recId = await insertRecording(supabase, {
                bunnyVideoId: video.guid,
                libraryId,
                filename,
                sessionDate,
                sessionType: parsedSessionType,
                bookingId: null,
                confidence: 'manual_review',
                parsedName: parsedName || null,
                parsedEmail,
                durationSeconds: video.length ?? null,
                suggestedBookings,
                manualReason,
              });
              if (recId) {
                await supabase.from('booking_recording_audit').insert({
                  recording_id: recId,
                  action: 'import_manual_review',
                  actor_id: SYSTEM_ACTOR,
                  details: { reason: manualReason, email: parsedEmail, filename },
                });
              }
            }
            continue;
          }

          // Email not found in auth.users — fall through to manual_review
          report.manual_review.push({
            filename,
            parsed_date: sessionDate ?? undefined,
            parsed_name: parsedName || undefined,
            parsed_session_type: parsedSessionType ?? undefined,
            reason: `email_not_found (${parsedEmail})`,
          });

          if (!dryRun) {
            const suggestedBookings = await findSuggestedBookings(supabase, parsedDate, parsedSessionType);
            const recId = await insertRecording(supabase, {
              bunnyVideoId: video.guid,
              libraryId,
              filename,
              sessionDate,
              sessionType: parsedSessionType,
              bookingId: null,
              confidence: 'manual_review',
              parsedName: parsedName || null,
              parsedEmail,
              durationSeconds: video.length ?? null,
              suggestedBookings,
              manualReason: `email_not_found`,
            });
            if (recId) {
              await supabase.from('booking_recording_audit').insert({
                recording_id: recId,
                action: 'import_manual_review',
                actor_id: SYSTEM_ACTOR,
                details: { reason: 'email_not_found', email: parsedEmail, filename },
              });
            }
          }
          continue;
        }

        // ══════════════════════════════════════════════════════════════
        // PATH B: no email → manual_review (name-only is not reliable)
        // ══════════════════════════════════════════════════════════════
        report.manual_review.push({
          filename,
          parsed_date: sessionDate ?? undefined,
          parsed_name: parsedName || undefined,
          parsed_session_type: parsedSessionType ?? undefined,
          reason: 'no_email_in_filename',
        });

        if (!dryRun) {
          const suggestedBookings = parsedDate
            ? await findSuggestedBookings(supabase, parsedDate, parsedSessionType)
            : [];

          const recId = await insertRecording(supabase, {
            bunnyVideoId: video.guid,
            libraryId,
            filename,
            sessionDate,
            sessionType: parsedSessionType,
            bookingId: null,
            confidence: 'manual_review',
            parsedName: parsedName || null,
            parsedEmail: null,
            durationSeconds: video.length ?? null,
            suggestedBookings,
            manualReason: 'no_email_in_filename',
          });
          if (recId) {
            await supabase.from('booking_recording_audit').insert({
              recording_id: recId,
              action: 'import_manual_review',
              actor_id: SYSTEM_ACTOR,
              details: { reason: 'no_email_in_filename', parsed_name: parsedName, filename },
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        report.errors.push({ filename, error: msg });
        console.error(`  Error processing ${filename}:`, msg);
      }

      if (processed % 10 === 0) {
        console.log(`  Processed ${processed}/${totalItems}...`);
      }
    }

    page++;
  }

  // ── Write report ──────────────────────────────────────────────────────────
  const reportPath = 'import-report.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=== Import Report ===');
  console.log(`Total scanned:                ${report.total}`);
  console.log(`→ Matched (exact_email):      ${report.exact_email.length}`);
  console.log(`→ Queued for manual review:   ${report.manual_review.length}`);
  console.log(`  breakdown:`);
  const reasons = report.manual_review.reduce<Record<string, number>>((acc, r) => {
    const key = r.reason.split(' ')[0]; // first word
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  for (const [reason, count] of Object.entries(reasons)) {
    console.log(`    ${reason}: ${count}`);
  }
  console.log(`→ Skipped (VOD subscription): ${report.skipped_vod}`);
  console.log(`→ Skipped (retention >365d):  ${report.skipped_retention.length}`);
  console.log(`→ Skipped (duplicate):        ${report.skipped_duplicate}`);
  console.log(`→ Errors:                     ${report.errors.length}`);
  console.log(`\nFull report saved to: ${reportPath}`);
  if (dryRun) console.log('\n(DRY RUN — no records inserted, no access granted)');
}

main().catch(console.error);
