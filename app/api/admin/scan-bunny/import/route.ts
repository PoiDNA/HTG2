import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import {
  parseDate, extractEmail, inferSessionType,
  computeExpiresAt, daysDiff, safeDecode,
} from '@/lib/recording-import';
import crypto from 'crypto';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const BATCH_LIMIT = 30;

interface FileInput {
  sourceUrl: string;
  fileSize: number;
}

/**
 * POST /api/admin/scan-bunny/import
 * Step 2: Batch import recordings into DB with user assignment.
 * Accepts max 30 files per request. Frontend batches larger sets.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
  }

  const body = await req.json();
  const files: FileInput[] = body.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > BATCH_LIMIT) {
    return NextResponse.json({ error: `Wymagane 1-${BATCH_LIMIT} plików` }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // ── 1. Server-side parse each file ────────────────────────────
  const parsed = files.map(f => {
    const parts = f.sourceUrl.split('/');
    const filename = parts[parts.length - 1];
    return {
      sourceUrl: f.sourceUrl,
      filename,
      fileSize: f.fileSize,
      email: extractEmail(filename),
      date: parseDate(filename),
      sessionType: inferSessionType(filename),
    };
  });

  // ── 2. Batch resolve emails → profiles ────────────────────────
  const uniqueEmails = [...new Set(parsed.map(p => p.email).filter(Boolean))] as string[];
  const profileMap = new Map<string, { id: string; email: string }>();

  if (uniqueEmails.length > 0) {
    // Check both email and second_email
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email, second_email')
      .or(uniqueEmails.map(e => `email.eq.${e},second_email.eq.${e}`).join(','));

    if (profiles) {
      for (const p of profiles) {
        if (p.email) profileMap.set(p.email.toLowerCase(), { id: p.id, email: p.email });
        if (p.second_email) profileMap.set(p.second_email.toLowerCase(), { id: p.id, email: p.second_email });
      }
    }

    // Check for ambiguity (>1 profile for same email)
    const emailCounts = new Map<string, number>();
    if (profiles) {
      for (const e of uniqueEmails) {
        const matches = profiles.filter(p =>
          p.email?.toLowerCase() === e || p.second_email?.toLowerCase() === e
        );
        emailCounts.set(e, matches.length);
      }
    }
    // Remove ambiguous entries
    for (const [email, count] of emailCounts) {
      if (count > 1) profileMap.delete(email);
    }
  }

  // ── 3. Booking fallback for session type ──────────────────────
  async function findBookingForUser(userId: string, dateStr: string): Promise<{
    bookingId: string;
    sessionType: string;
    slotDate: string;
  } | null> {
    const before = offsetDate(dateStr, -7);
    const after = offsetDate(dateStr, 7);

    // As client
    const { data: asClient } = await db
      .from('bookings')
      .select('id, session_type, booking_slots!inner(slot_date)')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'completed'])
      .gte('booking_slots.slot_date', before)
      .lte('booking_slots.slot_date', after)
      .limit(5);

    // As companion
    const { data: asCompanion } = await db
      .from('booking_companions')
      .select('booking_id, user_id, bookings!inner(id, session_type, user_id, booking_slots!inner(slot_date))')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .not('user_id', 'is', null)
      .gte('bookings.booking_slots.slot_date', before)
      .lte('bookings.booking_slots.slot_date', after)
      .in('bookings.status', ['confirmed', 'completed'])
      .limit(5);

    type Candidate = { bookingId: string; sessionType: string; slotDate: string; ownerId: string };
    const candidates: Candidate[] = [];

    for (const b of asClient ?? []) {
      const slots = b.booking_slots as any[];
      for (const s of (Array.isArray(slots) ? slots : [slots])) {
        candidates.push({
          bookingId: b.id,
          sessionType: b.session_type,
          slotDate: s.slot_date,
          ownerId: userId,
        });
      }
    }
    for (const c of asCompanion ?? []) {
      const b = c.bookings as any;
      const slots = b.booking_slots;
      for (const s of (Array.isArray(slots) ? slots : [slots])) {
        if (!candidates.some(x => x.bookingId === b.id)) {
          candidates.push({
            bookingId: b.id,
            sessionType: b.session_type,
            slotDate: s.slot_date,
            ownerId: b.user_id,
          });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by closest date, prefer exact match
    candidates.sort((a, b) =>
      Math.abs(daysDiff(a.slotDate, dateStr)) - Math.abs(daysDiff(b.slotDate, dateStr))
    );

    // If top two are equidistant → ambiguous, return null
    if (candidates.length >= 2 &&
      Math.abs(daysDiff(candidates[0].slotDate, dateStr)) === Math.abs(daysDiff(candidates[1].slotDate, dateStr)) &&
      candidates[0].bookingId !== candidates[1].bookingId) {
      return null;
    }

    return {
      bookingId: candidates[0].bookingId,
      sessionType: candidates[0].sessionType,
      slotDate: candidates[0].slotDate,
    };
  }

  // ── 4. Build recordings batch ─────────────────────────────────
  type RecordingRow = Record<string, any>;
  const recordingsBatch: RecordingRow[] = [];
  const fileContext = new Map<string, {
    userId: string | null;
    bookingId: string | null;
    confidence: string;
  }>();

  for (const p of parsed) {
    const profile = p.email ? profileMap.get(p.email) : null;
    const userId = profile?.id ?? null;
    let sessionType = p.sessionType;
    let bookingId: string | null = null;

    // Booking fallback
    if (userId && p.date) {
      if (!sessionType) {
        const booking = await findBookingForUser(userId, p.date);
        if (booking) {
          sessionType = booking.sessionType;
          bookingId = booking.bookingId;
        }
      } else {
        // Even with inferred type, try to find booking for companion access
        const booking = await findBookingForUser(userId, p.date);
        if (booking) bookingId = booking.bookingId;
      }
    }

    const confidence = userId ? 'exact_email' : 'manual_review';

    fileContext.set(p.sourceUrl, { userId, bookingId, confidence });

    recordingsBatch.push({
      source: 'import',
      status: 'ready',
      import_confidence: confidence,
      import_filename: p.filename,
      session_date: p.date || null,
      session_type: sessionType || null,
      booking_id: bookingId,
      source_url: p.sourceUrl,
      expires_at: computeExpiresAt(p.date),
      title: `Import — ${p.date || 'brak daty'} — ${p.email || 'brak emaila'}`,
      metadata: {
        parsed_email: p.email,
        cdn_path: p.sourceUrl,
        file_size: p.fileSize,
        has_booking: !!bookingId,
      },
    });
  }

  // ── 5. Bulk insert recordings ─────────────────────────────────
  const { data: inserted, error: insertError } = await db
    .from('booking_recordings')
    .upsert(recordingsBatch, { onConflict: 'source_url', ignoreDuplicates: true })
    .select('id, source_url, import_confidence');

  if (insertError) {
    console.error('scan-bunny/import: recordings insert error:', insertError);
    return NextResponse.json({ error: 'Błąd zapisu nagrań' }, { status: 500 });
  }

  const insertedRecordings = inserted || [];
  const insertedIds = insertedRecordings.map(r => r.id);
  const skippedCount = recordingsBatch.length - insertedRecordings.length;

  // ── 6. Build access batch (only exact_email) ──────────────────
  const accessBatch: Array<{ recording_id: string; user_id: string; granted_reason: string }> = [];
  const auditBatch: Array<{ recording_id: string; action: string; actor_id: string; details: any }> = [];

  for (const rec of insertedRecordings) {
    const ctx = fileContext.get(rec.source_url);
    if (!ctx) continue;

    // Audit for all
    auditBatch.push({
      recording_id: rec.id,
      action: ctx.confidence === 'exact_email' ? 'import_matched' : 'import_manual_review',
      actor_id: user.id,
      details: {
        source_url: rec.source_url,
        confidence: ctx.confidence,
        user_id: ctx.userId,
        booking_id: ctx.bookingId,
      },
    });

    // Access only for exact_email with userId
    if (ctx.confidence !== 'exact_email' || !ctx.userId) continue;

    accessBatch.push({
      recording_id: rec.id,
      user_id: ctx.userId,
      granted_reason: ctx.bookingId ? 'booking_client' : 'import_match',
    });

    // Grant companions access if booking found
    if (ctx.bookingId) {
      const { data: companions } = await db
        .from('booking_companions')
        .select('user_id')
        .eq('booking_id', ctx.bookingId)
        .not('user_id', 'is', null)
        .not('accepted_at', 'is', null);

      for (const c of companions ?? []) {
        if (c.user_id && c.user_id !== ctx.userId) {
          accessBatch.push({
            recording_id: rec.id,
            user_id: c.user_id,
            granted_reason: 'companion',
          });
        }
      }
    }
  }

  // Deduplicate access rows
  const uniqueAccess = [...new Map(
    accessBatch.map(a => [`${a.recording_id}:${a.user_id}`, a])
  ).values()];

  // ── 7. Insert access + audit (with rollback on access failure) ─
  try {
    if (uniqueAccess.length > 0) {
      const { error: accessError } = await db
        .from('booking_recording_access')
        .insert(uniqueAccess);
      if (accessError) throw accessError;
    }
  } catch (accessErr) {
    console.error('scan-bunny/import: access insert error, rolling back recordings:', accessErr);
    if (insertedIds.length > 0) {
      await db.from('booking_recordings').delete().in('id', insertedIds);
    }
    return NextResponse.json({ error: 'Błąd przypisywania dostępu — cofnięto import' }, { status: 500 });
  }

  // Audit: best-effort (don't rollback on audit failure)
  try {
    if (auditBatch.length > 0) {
      await db.from('booking_recording_audit').insert(auditBatch);
    }
  } catch (auditErr) {
    console.error('scan-bunny/import: audit insert error (non-fatal):', auditErr);
  }

  // ── 8. Build report ───────────────────────────────────────────
  const imported = insertedRecordings.filter(r => r.import_confidence === 'exact_email');
  const manualReview = insertedRecordings.filter(r => r.import_confidence === 'manual_review');

  return NextResponse.json({
    imported: imported.map(r => ({ id: r.id, sourceUrl: r.source_url })),
    manualReview: manualReview.map(r => ({ id: r.id, sourceUrl: r.source_url })),
    skippedCount,
    totalProcessed: files.length,
  });
}

function offsetDate(dateStr: string, days: number): string {
  const ms = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  const d = new Date(ms + days * 86400000);
  return d.toISOString().slice(0, 10);
}
