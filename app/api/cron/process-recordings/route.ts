import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { generateR2PresignedUrl } from '@/lib/r2-presigned';
import {
  isBackupStorageConfigured,
  getBackupStorageZone,
  uploadBackupFile,
  buildRecordingStoragePath,
} from '@/lib/bunny-backup-storage';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/process-recordings
 * Runs every 2 minutes. 6 logical sections with independent counters.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = createSupabaseServiceRole();
  const stats = {
    uploaded: 0, checked: 0, expired: 0, orphaned: 0,
    cleaned: 0, notified: 0, ignored: 0, errors: 0,
  };

  try {
    await section1UploadWorker(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 1 error:', e); stats.errors++; }

  try {
    await section2StatusPolling(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 2 error:', e); stats.errors++; }

  try {
    await section3RetentionExpiry(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 3 error:', e); stats.errors++; }

  try {
    await section4OrphanGC(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 4 error:', e); stats.errors++; }

  try {
    await section5SourceCleanup(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 5 error:', e); stats.errors++; }

  try {
    await section7StuckEgressCleanup(db, stats);
  } catch (e) { console.error('[cron:recordings] Section 7 error:', e); stats.errors++; }

  console.log(
    `[cron:recordings] uploaded=${stats.uploaded} checked=${stats.checked} expired=${stats.expired} ` +
    `orphaned=${stats.orphaned} cleaned=${stats.cleaned} ignored=${stats.ignored} errors=${stats.errors}`
  );

  return NextResponse.json({ ok: true, stats });
}

type DB = ReturnType<typeof createSupabaseServiceRole>;

// ── Section 1: UPLOAD WORKER — queued → ready (direct Storage upload) ─────
// HTG2 uses Bunny Storage as primary (NOT Bunny Stream) because we serve audio,
// not video. No encoding/transcoding step → status goes directly from queued → ready.
// Path: recordings/{booking_id}/{recording_id}.{ext} in BUNNY_BACKUP_STORAGE_ZONE
// (env name kept for backward compat; this is now the primary HTG2 storage zone).
async function section1UploadWorker(db: DB, stats: Record<string, number>) {
  const { data: records, error } = await db
    .from('booking_recordings')
    .select('*, booking:bookings(user_id, session_type), companions:booking_companions(user_id)')
    .eq('status', 'queued')
    .not('duration_seconds', 'is', null)  // Skip records waiting for egress_ended
    .order('created_at', { ascending: true })
    .limit(5);

  if (error || !records?.length) return;

  if (!isBackupStorageConfigured()) {
    console.warn('[cron:recordings] Bunny Storage not configured — set BUNNY_BACKUP_STORAGE_ZONE and BUNNY_BACKUP_STORAGE_API_KEY');
    return;
  }

  for (const rec of records) {
    try {
      // Explicit guard: skip if duration still null (shouldn't happen given query, but be safe)
      if (rec.duration_seconds == null) continue;

      const phase = (rec.recording_phase as string | null) ?? 'sesja';
      const isSesja = phase === 'sesja';

      // Duration check — ignore short fragments
      // For wstep/podsumowanie use 10s threshold (these phases can be brief)
      const effectiveMinDuration = isSesja
        ? (rec.min_duration_seconds ?? 60)
        : Math.min(rec.min_duration_seconds ?? 60, 10);

      if (rec.duration_seconds < effectiveMinDuration) {
        await db.from('booking_recordings').update({
          status: 'ignored',
          last_error: `Recording too short: ${rec.duration_seconds}s < ${effectiveMinDuration}s`,
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        await audit(db, rec.id, 'recording_ignored', { duration: rec.duration_seconds });
        stats.ignored++;
        continue;
      }

      if (!rec.source_url) {
        await db.from('booking_recordings').update({
          status: 'failed', last_error: 'No source_url',
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        stats.errors++;
        continue;
      }

      // Download from R2 using presigned URL (24h TTL)
      const presignedUrl = generateR2PresignedUrl(rec.source_url, 86400);
      const r2Response = await fetch(presignedUrl);
      if (!r2Response.ok) {
        throw new Error(`R2 fetch failed: ${r2Response.status}`);
      }
      const buffer = await r2Response.arrayBuffer();

      // Look up booking owner email for a human-readable storage path
      // (one extra query per record — cron limits to 5 records/run so cost is negligible)
      const bookingData = rec.booking as Record<string, unknown> | null;
      const userId = bookingData?.user_id as string | undefined;
      let userEmail: string | null = null;
      if (userId) {
        const { data: profile } = await db
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle();
        userEmail = (profile?.email as string | null) ?? null;
      }

      // Build human-navigable storage path:
      //   recordings/{YYYY-MM-DD}/{email}/{phase}-{session_type}-{short_id}.{ext}
      // Example:
      //   recordings/2026-04-08/jan.kowalski@example.com/sesja-natalia_solo-f7d9e2a5.mp4
      const ext = (rec.source_url as string).split('.').pop() || 'mp4';
      const storagePath = buildRecordingStoragePath({
        sessionDate: (rec.session_date as string | null) ?? null,
        userEmail,
        phase,
        sessionType: (rec.session_type as string | null) ?? null,
        recordingId: rec.id as string,
        extension: ext,
      });
      await uploadBackupFile(storagePath, buffer);

      // Mark ready immediately — Storage has no encoding step, no polling needed
      // expires_at: explicitly NULL → retention disabled, recordings kept indefinitely
      await db.from('booking_recordings').update({
        backup_storage_path: storagePath,
        backup_storage_zone: getBackupStorageZone(),
        backup_status: 'ready',
        status: 'ready',
        expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', rec.id);
      await audit(db, rec.id, 'bunny_ready', {
        backup_storage_path: storagePath,
        backup_storage_zone: getBackupStorageZone(),
        size_bytes: buffer.byteLength,
        recording_phase: phase,
      });

      // Grant access based on consent — ONLY for sesja phase
      // Wstep/podsumowanie are admin-only and never get client access rows
      if (isSesja) {
        await grantAccessIfConsented(db, rec);
      }

      stats.uploaded++;
    } catch (e) {
      console.error(`[cron:recordings] Upload error for ${rec.id}:`, e);
      await db.from('booking_recordings').update({
        retry_count: (rec.retry_count ?? 0) + 1,
        last_error: e instanceof Error ? e.message : 'unknown',
        status: (rec.retry_count ?? 0) + 1 >= (rec.max_retries ?? 3) ? 'failed' : 'queued',
        updated_at: new Date().toISOString(),
      }).eq('id', rec.id);
      stats.errors++;
    }
  }
}

// ── Section 2: STATUS POLLING — NO-OP for HTG2 ────────────────────────────
// HTG2 uses Bunny Storage as primary. Storage has no encoding step → Section 1
// marks records as 'ready' directly. Polling is no longer needed.
//
// Kept as empty stub to preserve the 7-section structure and the stats shape.
// If old Bunny Stream records from historical imports ever need polling, add
// the legacy logic back here (git history: commit b36ad70, section2StatusPolling).
async function section2StatusPolling(_db: DB, _stats: Record<string, number>) {
  // no-op
}

// ── Section 3: RETENTION EXPIRY — DISABLED for HTG2 ──────────────────────
// Retention is turned off: cron will never delete recordings automatically.
// New HTG2 records have expires_at = NULL (set in Section 1) so they are
// never matched by expiry queries. Any legacy records with expires_at set
// are also left alone — this function is a no-op until deletion policy changes.
async function section3RetentionExpiry(_db: DB, _stats: Record<string, number>) {
  // no-op: user requested "keep everything, never delete automatically"
}

// ── Section 4: ORPHAN GC — DISABLED for HTG2 ─────────────────────────────
// User requested no automatic deletion of any kind. Orphan GC would delete
// recordings that have no access rows after 6h/12h grace period — but that
// logic conflicts with "keep everything". Disabled until explicit admin action.
async function section4OrphanGC(_db: DB, _stats: Record<string, number>) {
  // no-op: user requested "keep everything, never delete automatically"
}

// ── Section 5: R2 SOURCE CLEANUP — DISABLED for HTG2 ────────────────────
// User requested no automatic deletion. R2 now acts as a second copy of every
// recording (alongside Bunny Storage) — keep indefinitely.
async function section5SourceCleanup(_db: DB, _stats: Record<string, number>) {
  // no-op: user requested "keep everything, never delete automatically"
}

// ── Section 7: STUCK EGRESS CLEANUP ────────────────────────────────────────
// Handles recordings stuck in 'queued' with duration_seconds = NULL because
// LiveKit never sent egress_ended (network loss, server restart, etc.)
// After 4 hours the session is definitely over — mark as failed for admin review.
async function section7StuckEgressCleanup(db: DB, stats: Record<string, number>) {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: stuck } = await db
    .from('booking_recordings')
    .select('id')
    .eq('status', 'queued')
    .is('duration_seconds', null)
    .eq('source', 'live')
    .lt('created_at', fourHoursAgo)
    .limit(10);

  for (const rec of stuck ?? []) {
    await db.from('booking_recordings').update({
      status: 'failed',
      last_error: 'egress_ended_never_received',
      updated_at: new Date().toISOString(),
    }).eq('id', rec.id);
    await audit(db, rec.id, 'retry', {
      reason: 'stuck_egress_cleanup',
      auto: true,
    });
    console.warn(`[cron:recordings] Section 7: stuck egress record ${rec.id} marked failed`);
    stats.errors++; // Visible in stats for monitoring
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function audit(
  db: DB,
  recordingId: string,
  action: string,
  details: Record<string, unknown> = {},
  actorId: string = SYSTEM_ACTOR
) {
  await db.from('booking_recording_audit').insert({
    recording_id: recordingId,
    action,
    actor_id: actorId,
    details,
  });
}

async function grantAccessIfConsented(db: DB, rec: Record<string, unknown>) {
  const bookingId = rec.booking_id as string;
  if (!bookingId) return;

  const booking = rec.booking as Record<string, unknown> | null;
  if (!booking) return;

  const userId = booking.user_id as string;
  const sessionType = booking.session_type as string;

  // Check access consent for primary client
  const { data: accessConsent } = await db
    .from('consent_records')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('user_id', userId)
    .eq('consent_type', 'session_recording_access')
    .eq('granted', true)
    .maybeSingle();

  if (!accessConsent) {
    await audit(db, rec.id as string, 'consent_missing_at_grant', { user_id: userId });
    return;
  }

  // Grant primary client
  await db.from('booking_recording_access').upsert({
    recording_id: rec.id as string,
    user_id: userId,
    granted_reason: 'booking_client',
    consent_record_id: accessConsent.id,
  }, { onConflict: 'recording_id,user_id' });
  await audit(db, rec.id as string, 'access_granted', { user_id: userId, reason: 'booking_client' });

  // For para sessions — grant companion if consented
  if (sessionType === 'natalia_para') {
    const companions = (rec.companions as Array<Record<string, unknown>>) ?? [];
    for (const comp of companions) {
      if (!comp.user_id) continue;
      const compUserId = comp.user_id as string;

      const { data: compConsent } = await db
        .from('consent_records')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('user_id', compUserId)
        .eq('consent_type', 'session_recording_access')
        .eq('granted', true)
        .maybeSingle();

      if (!compConsent) {
        await audit(db, rec.id as string, 'consent_missing_at_grant', { user_id: compUserId });
        continue;
      }

      await db.from('booking_recording_access').upsert({
        recording_id: rec.id as string,
        user_id: compUserId,
        granted_reason: 'companion',
        consent_record_id: compConsent.id,
      }, { onConflict: 'recording_id,user_id' });
      await audit(db, rec.id as string, 'access_granted', { user_id: compUserId, reason: 'companion' });
    }
  }
}
