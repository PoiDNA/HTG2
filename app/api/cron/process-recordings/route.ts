import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createVideo, fetchVideoFromUrl, getVideoStatus, deleteVideo } from '@/lib/bunny-stream';
import { generateR2PresignedUrl, deleteR2Object } from '@/lib/r2-presigned';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID!;
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

// ── Section 1: UPLOAD WORKER — queued → preparing → uploading ──────────────
async function section1UploadWorker(db: DB, stats: Record<string, number>) {
  const { data: records, error } = await db
    .from('booking_recordings')
    .select('*, booking:bookings(user_id, session_type), companions:booking_companions(user_id)')
    .eq('status', 'queued')
    .not('duration_seconds', 'is', null)  // Skip records waiting for egress_ended
    .order('created_at', { ascending: true })
    .limit(5);

  if (error || !records?.length) return;

  for (const rec of records) {
    try {
      // Explicit guard: skip if duration still null (shouldn't happen given query, but be safe)
      if (rec.duration_seconds == null) continue;

      // Duration check — ignore short fragments
      if (rec.duration_seconds < (rec.min_duration_seconds ?? 60)) {
        await db.from('booking_recordings').update({
          status: 'ignored',
          last_error: `Recording too short: ${rec.duration_seconds}s < ${rec.min_duration_seconds ?? 60}s`,
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        await audit(db, rec.id, 'recording_ignored', { duration: rec.duration_seconds });
        stats.ignored++;
        continue;
      }

      // Generate Pre-Signed URL (24h TTL)
      if (!rec.source_url) {
        await db.from('booking_recordings').update({
          status: 'failed', last_error: 'No source_url',
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        stats.errors++;
        continue;
      }

      const presignedUrl = generateR2PresignedUrl(rec.source_url, 86400);

      // Step 1: Create video in Bunny — then COMMIT bunny_video_id
      const { guid } = await createVideo(BUNNY_LIBRARY_ID, rec.title ?? 'Sesja');
      await db.from('booking_recordings').update({
        bunny_video_id: guid,
        bunny_library_id: BUNNY_LIBRARY_ID,
        status: 'preparing',
        updated_at: new Date().toISOString(),
      }).eq('id', rec.id);
      await audit(db, rec.id, 'bunny_video_created', { bunny_video_id: guid });

      // Step 2: Tell Bunny to fetch from R2
      try {
        await fetchVideoFromUrl(BUNNY_LIBRARY_ID, guid, presignedUrl);
        await db.from('booking_recordings').update({
          status: 'uploading',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        await audit(db, rec.id, 'bunny_fetch_started', {});
      } catch (fetchErr) {
        // bunny_video_id is saved — retry will reuse or clean it
        console.warn(`[cron:recordings] fetchVideoFromUrl failed for ${rec.id}:`, fetchErr);
        await db.from('booking_recordings').update({
          last_error: fetchErr instanceof Error ? fetchErr.message : 'fetch failed',
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        // Status stays 'preparing' — Section 2 will detect stuck and reset
        continue;
      }

      // Grant access based on consent
      await grantAccessIfConsented(db, rec);

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

// ── Section 2: STATUS POLLING + stuck preparing recovery ───────────────────
async function section2StatusPolling(db: DB, stats: Record<string, number>) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Active uploads/processing (throttled to 5min intervals)
  const { data: active } = await db
    .from('booking_recordings')
    .select('id, bunny_video_id, bunny_library_id, status, retry_count, max_retries')
    .in('status', ['uploading', 'processing'])
    .or(`last_checked_at.is.null,last_checked_at.lt.${fiveMinAgo}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(10);

  // Stuck preparing (>10min)
  const { data: stuck } = await db
    .from('booking_recordings')
    .select('id, bunny_video_id, retry_count, max_retries')
    .eq('status', 'preparing')
    .lt('updated_at', tenMinAgo)
    .limit(5);

  // Handle stuck preparing
  for (const rec of stuck ?? []) {
    await db.from('booking_recordings').update({
      status: 'queued',
      last_error: 'Stuck in preparing state — reset to queued',
      updated_at: new Date().toISOString(),
    }).eq('id', rec.id);
    await audit(db, rec.id, 'preparing_stuck_reset', {});
    stats.checked++;
  }

  // Poll Bunny status
  for (const rec of active ?? []) {
    if (!rec.bunny_video_id || !rec.bunny_library_id) continue;

    try {
      const { status: bunnyStatus } = await getVideoStatus(rec.bunny_library_id, rec.bunny_video_id);

      if (bunnyStatus === 4) {
        // Finished
        await db.from('booking_recordings').update({
          status: 'ready',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
        await audit(db, rec.id, 'bunny_ready', {});
      } else if (bunnyStatus === 3 || bunnyStatus === 2 || bunnyStatus === 1) {
        // Still processing
        await db.from('booking_recordings').update({
          status: 'processing',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id);
      } else if (bunnyStatus === 5) {
        // Failed
        const newRetry = (rec.retry_count ?? 0) + 1;
        if (newRetry >= (rec.max_retries ?? 3)) {
          await db.from('booking_recordings').update({
            status: 'failed',
            retry_count: newRetry,
            last_error: 'Bunny encoding failed',
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', rec.id);
          await audit(db, rec.id, 'bunny_failed', { retry_count: newRetry });
        } else {
          await db.from('booking_recordings').update({
            status: 'queued',
            retry_count: newRetry,
            last_error: 'Bunny encoding failed — retrying',
            updated_at: new Date().toISOString(),
          }).eq('id', rec.id);
          await audit(db, rec.id, 'retry', { retry_count: newRetry });
        }
      }

      stats.checked++;
    } catch (e) {
      console.warn(`[cron:recordings] Status check failed for ${rec.id}:`, e);
    }
  }
}

// ── Section 3: RETENTION EXPIRY ────────────────────────────────────────────
async function section3RetentionExpiry(db: DB, stats: Record<string, number>) {
  const now = new Date().toISOString();

  const { data: expired } = await db
    .from('booking_recordings')
    .select('id, bunny_video_id, bunny_library_id, source_url, source_cleaned_at')
    .eq('status', 'ready')
    .eq('legal_hold', false)
    .lt('expires_at', now)
    .limit(10);

  for (const rec of expired ?? []) {
    try {
      // Delete from Bunny
      if (rec.bunny_video_id && rec.bunny_library_id) {
        await deleteVideo(rec.bunny_library_id, rec.bunny_video_id);
        await audit(db, rec.id, 'bunny_deleted', { bunny_video_id: rec.bunny_video_id });
      }

      // Clean R2 source if not already cleaned
      if (rec.source_url && !rec.source_cleaned_at) {
        try {
          await deleteR2Object(rec.source_url);
          await db.from('booking_recordings').update({
            source_cleaned_at: new Date().toISOString(),
          }).eq('id', rec.id);
          await audit(db, rec.id, 'source_cleaned', {});
        } catch (e) {
          console.warn(`[cron:recordings] R2 cleanup failed for ${rec.id}:`, e);
        }
      }

      await db.from('booking_recordings').update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      }).eq('id', rec.id);
      await audit(db, rec.id, 'expired', { reason: 'retention' });

      stats.expired++;
    } catch (e) {
      console.error(`[cron:recordings] Expiry error for ${rec.id}:`, e);
      stats.errors++;
    }
  }
}

// ── Section 4: ORPHAN GC — recordings with no access rows ──────────────────
async function section4OrphanGC(db: DB, stats: Record<string, number>) {
  // Grace period: 6 hours (gives time for cron grant + manual operations)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Exclusions:
  // - legal_hold recordings are never orphaned
  // - manual_review imports have no access rows by design (waiting for admin_assigned)
  // - duration_seconds IS NULL = still waiting for egress_ended (not truly orphaned yet)
  const { data: candidates } = await db
    .from('booking_recordings')
    .select('id, bunny_video_id, bunny_library_id, source_url, source_cleaned_at, legal_hold, import_confidence')
    .in('status', ['ready', 'uploading', 'processing', 'queued'])
    .eq('legal_hold', false)
    .not('import_confidence', 'eq', 'manual_review')
    .lt('created_at', sixHoursAgo)
    .limit(20);

  for (const rec of candidates ?? []) {
    // Re-check: legal_hold guard (defensive)
    if (rec.legal_hold) continue;

    // Check access rows
    const { count } = await db
      .from('booking_recording_access')
      .select('id', { count: 'exact', head: true })
      .eq('recording_id', rec.id);

    if ((count ?? 0) > 0) continue;

    // Orphan confirmed — delete external assets FIRST
    // CRITICAL: if external delete fails, do NOT mark as expired (retry next cycle)
    try {
      if (rec.bunny_video_id && rec.bunny_library_id) {
        await deleteVideo(rec.bunny_library_id, rec.bunny_video_id);
        await audit(db, rec.id, 'bunny_deleted', { reason: 'orphan' });
      }
    } catch (e) {
      console.error(`[cron:recordings] Orphan GC: Bunny delete failed for ${rec.id}, skipping:`, e);
      stats.errors++;
      continue; // Do NOT expire — Bunny file still exists, retry next cycle
    }

    // R2 cleanup (best-effort — file will become inaccessible naturally, don't block on failure)
    if (rec.source_url && !rec.source_cleaned_at) {
      try {
        await deleteR2Object(rec.source_url);
        await db.from('booking_recordings').update({
          source_cleaned_at: new Date().toISOString(),
        }).eq('id', rec.id);
        await audit(db, rec.id, 'source_cleaned', { reason: 'orphan' });
      } catch (e) {
        console.warn(`[cron:recordings] Orphan GC: R2 cleanup failed for ${rec.id} (non-blocking):`, e);
      }
    }

    // All external deletes done — now mark as expired
    await db.from('booking_recordings').update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    }).eq('id', rec.id);
    await audit(db, rec.id, 'orphan_deleted', { reason: 'no_access_rows' });
    stats.orphaned++;
  }
}

// ── Section 5: R2 SOURCE CLEANUP ───────────────────────────────────────────
async function section5SourceCleanup(db: DB, stats: Record<string, number>) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  // Clean R2 for: expired, ignored, or failed >14d
  // For 'ready' — keep R2 until expires_at (R2 = backup)
  const { data: toClean } = await db
    .from('booking_recordings')
    .select('id, source_url, status')
    .is('source_cleaned_at', null)
    .not('source_url', 'is', null)
    .eq('legal_hold', false)
    .or(`status.eq.expired,status.eq.ignored,and(status.eq.failed,updated_at.lt.${fourteenDaysAgo})`)
    .limit(10);

  for (const rec of toClean ?? []) {
    if (!rec.source_url) continue;
    try {
      await deleteR2Object(rec.source_url);
      await db.from('booking_recordings').update({
        source_cleaned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', rec.id);
      await audit(db, rec.id, 'source_cleaned', { status: rec.status });
      stats.cleaned++;
    } catch (e) {
      console.warn(`[cron:recordings] R2 cleanup failed for ${rec.id}:`, e);
    }
  }
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
    await audit(db, rec.id as string, 'consent_missing_at_grant' as never, { user_id: userId });
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
        await audit(db, rec.id as string, 'consent_missing_at_grant' as never, { user_id: compUserId });
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
