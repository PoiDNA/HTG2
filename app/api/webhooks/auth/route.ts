import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { deleteVideo } from '@/lib/bunny-stream';
import { deleteR2Object } from '@/lib/r2-presigned';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

/**
 * POST /api/webhooks/auth
 * Handles Supabase Auth Webhooks (user.deleted).
 *
 * Security: HMAC-SHA256 verification + idempotency key.
 *
 * user.deleted → For each recording the deleted user had access to:
 *   - solo, no legal_hold: delete from Bunny + R2, mark expired
 *   - para, no legal_hold: pair_revoke_emergency — all parties lose access + delete
 *   - legal_hold: revoke access rows only, notify admin
 */
export async function POST(request: NextRequest) {
  // ── 1. Verify HMAC-SHA256 signature ──────────────────────────────────────
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[auth-webhook] SUPABASE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-supabase-signature') ?? '';

  const expectedSig = 'sha256=' + createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSig) {
    console.warn('[auth-webhook] Invalid signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── 2. Idempotency — process each event exactly once ─────────────────────
  const eventId = (event.id ?? event.event_id) as string | undefined;
  if (!eventId) {
    console.warn('[auth-webhook] Event has no ID — cannot ensure idempotency');
    return NextResponse.json({ error: 'Event ID missing' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  const { data: alreadyProcessed } = await db
    .from('webhook_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (alreadyProcessed) {
    // Already processed — return 200 (idempotent)
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Register as processed (before doing work — prevents concurrent duplicates)
  await db.from('webhook_events').insert({
    event_id: eventId,
    event_type: event.type as string ?? 'unknown',
  });

  // ── 3. Handle user.deleted ────────────────────────────────────────────────
  const eventType = event.type as string;

  if (eventType !== 'user.deleted') {
    // Other event types — acknowledge without processing
    return NextResponse.json({ ok: true });
  }

  const deletedUser = event.user as Record<string, unknown> | undefined;
  const userId = deletedUser?.id as string | undefined;

  if (!userId) {
    console.error('[auth-webhook] user.deleted event missing user.id');
    return NextResponse.json({ error: 'User ID missing' }, { status: 400 });
  }

  console.log(`[auth-webhook] Processing user.deleted for ${userId}`);

  // Find all recordings this user had access to
  const { data: accessRows } = await db
    .from('booking_recording_access')
    .select('id, recording_id, revoked_at')
    .eq('user_id', userId);

  if (!accessRows?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const recordingIds = [...new Set(accessRows.map(r => r.recording_id))];
  let processed = 0;

  for (const recordingId of recordingIds) {
    try {
      const { data: recording } = await db
        .from('booking_recordings')
        .select('id, bunny_video_id, bunny_library_id, source_url, source_cleaned_at, session_type, legal_hold, status')
        .eq('id', recordingId)
        .single();

      if (!recording) continue;

      if (recording.legal_hold) {
        // Legal hold: only revoke this user's access. Asset stays for admin decision.
        await db.from('booking_recording_access').update({
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revoked_reason: 'account_deleted_legal_hold',
        }).eq('recording_id', recordingId).eq('user_id', userId);

        await db.from('booking_recording_audit').insert({
          recording_id: recordingId,
          action: 'access_revoked',
          actor_id: SYSTEM_ACTOR,
          details: {
            reason: 'account_deleted',
            user_id: userId,
            legal_hold: true,
            note: 'Asset preserved — admin review required',
          },
        });

        console.log(`[auth-webhook] Recording ${recordingId} has legal_hold — access revoked, asset preserved`);
        processed++;
        continue;
      }

      // Para session: pair_revoke_emergency — ALL parties lose access + delete asset
      if (recording.session_type === 'natalia_para') {
        // Revoke ALL access rows for this recording
        await db.from('booking_recording_access').update({
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revoked_reason: 'account_deleted_pair_emergency',
        }).eq('recording_id', recordingId);

        await db.from('booking_recording_audit').insert({
          recording_id: recordingId,
          action: 'pair_revoke_emergency',
          actor_id: SYSTEM_ACTOR,
          details: {
            reason: 'account_deleted',
            deleted_user: userId,
          },
        });

        // Delete physical assets
        await deleteRecordingAssets(db, recording);
        processed++;
        continue;
      }

      // Solo session (or other types): delete asset for this user
      // Revoke access rows
      await db.from('booking_recording_access').update({
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
        revoked_reason: 'account_deleted',
      }).eq('recording_id', recordingId).eq('user_id', userId);

      // Check if any other access rows still exist (no cascade for other users)
      const { count: remainingAccess } = await db
        .from('booking_recording_access')
        .select('id', { count: 'exact', head: true })
        .eq('recording_id', recordingId)
        .is('revoked_at', null);

      if ((remainingAccess ?? 0) === 0) {
        // No one left with access — delete asset
        await deleteRecordingAssets(db, recording);
      } else {
        await db.from('booking_recording_audit').insert({
          recording_id: recordingId,
          action: 'access_revoked',
          actor_id: SYSTEM_ACTOR,
          details: { reason: 'account_deleted', user_id: userId },
        });
      }

      processed++;
    } catch (err) {
      console.error(`[auth-webhook] Error processing recording ${recordingId}:`, err);
      // Continue processing other recordings
    }
  }

  console.log(`[auth-webhook] Processed ${processed} recordings for deleted user ${userId}`);
  return NextResponse.json({ ok: true, processed });
}

async function deleteRecordingAssets(
  db: ReturnType<typeof createSupabaseServiceRole>,
  recording: {
    id: string;
    bunny_video_id: string | null;
    bunny_library_id: string | null;
    source_url: string | null;
    source_cleaned_at: string | null;
    status: string;
  }
) {
  // Delete from Bunny
  if (recording.bunny_video_id && recording.bunny_library_id) {
    try {
      await deleteVideo(recording.bunny_library_id, recording.bunny_video_id);
      await db.from('booking_recording_audit').insert({
        recording_id: recording.id,
        action: 'bunny_deleted',
        actor_id: SYSTEM_ACTOR,
        details: { reason: 'account_deleted' },
      });
    } catch (e) {
      console.warn(`[auth-webhook] Bunny delete failed for ${recording.id}:`, e);
      // Continue — still mark expired and clean R2
    }
  }

  // Delete from R2 (best-effort)
  if (recording.source_url && !recording.source_cleaned_at) {
    try {
      await deleteR2Object(recording.source_url);
      await db.from('booking_recordings').update({
        source_cleaned_at: new Date().toISOString(),
      }).eq('id', recording.id);
      await db.from('booking_recording_audit').insert({
        recording_id: recording.id,
        action: 'source_cleaned',
        actor_id: SYSTEM_ACTOR,
        details: { reason: 'account_deleted' },
      });
    } catch (e) {
      console.warn(`[auth-webhook] R2 cleanup failed for ${recording.id}:`, e);
    }
  }

  // Mark expired
  await db.from('booking_recordings').update({
    status: 'expired',
    updated_at: new Date().toISOString(),
  }).eq('id', recording.id);

  await db.from('booking_recording_audit').insert({
    recording_id: recording.id,
    action: 'expired',
    actor_id: SYSTEM_ACTOR,
    details: { reason: 'account_deleted' },
  });
}
