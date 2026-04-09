import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { listRooms, listEgress, stopEgress } from '@/lib/live/livekit';
import {
  HTG_MEETING_ROOM_PREFIX,
  auditHtgRecording,
} from '@/lib/live/meeting-constants';

/**
 * GET /api/cron/htg-meeting-orphan-reaper
 *
 * Section 10 of the HTG Meetings recording pipeline (PR #6, plan v9).
 *
 * Hourly cron that catches LiveKit egresses for HTG meeting rooms that exist
 * in LiveKit but are NOT tracked in our `htg_meeting_egresses` junction table.
 * Webhook handlers (PR #5) NEVER call stopEgress in orphan paths to avoid
 * killing legal egresses mid-commit — this reaper handles cleanup after a
 * 30-minute TTL based on the egress's actual `startedAt` timestamp.
 *
 * v9 fixes applied:
 *  - C2: listEgress signature is positional (roomName: string), wrapper
 *    hardcodes `active: true`. Plan v9 errata corrected from object form.
 *  - C4: CRON_SECRET fail-closed in ALL environments. No dev bypass — dev
 *    must set CRON_SECRET=dev-secret in .env.local. Empty env was a latent
 *    DoS vector if the env drifted in staging/preview.
 *
 * Decision flow per egress:
 *  1. If startedAt missing OR not bigint → skip (don't stop unknown-age egress)
 *  2. If startedAt > NOW - 30min → skip (too young, may still be mid-commit)
 *  3. If junction row exists for egress_id → skip (tracked, not orphan)
 *  4. If recent pending row exists for parent session → skip (race window)
 *  5. Otherwise → stopEgress + audit egress_force_abandoned
 */
export async function GET(request: NextRequest) {
  // v9 C4: zero dev bypass. Fail-closed in all environments.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();

  // List all active LiveKit rooms, filter by HTG prefix
  let activeRooms;
  try {
    activeRooms = await listRooms();
  } catch (e) {
    console.error('[orphan-reaper] listRooms failed:', e);
    return NextResponse.json({ error: 'listRooms failed' }, { status: 500 });
  }

  const meetingRooms = (activeRooms ?? []).filter(
    (r) => r.name?.startsWith(HTG_MEETING_ROOM_PREFIX),
  );

  // Pre-compute thresholds
  const thirtyMinAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  // LiveKit SDK 2.x returns startedAt as bigint nanoseconds.
  // Use BigInt(...) constructor (not bigint literal `1_000_000n`) for ES2018 target.
  const thirtyMinAgoNanos = BigInt(Date.now() - 30 * 60 * 1000) * BigInt(1_000_000);

  let orphansStopped = 0;
  let scanned = 0;

  for (const room of meetingRooms) {
    if (!room.name) continue;

    // Pre-fetch session id once per room (used for pending lookup)
    const { data: sess } = await db
      .from('htg_meeting_sessions' as any)
      .select('id')
      .eq('room_name', room.name)
      .maybeSingle();

    let egresses;
    try {
      // v9 C2: listEgress wrapper is positional (roomName: string),
      // hardcodes { active: true } internally — see lib/live/livekit.ts:282-285.
      egresses = await listEgress(room.name);
    } catch (e) {
      console.error(`[orphan-reaper] listEgress failed for ${room.name}:`, e);
      continue;
    }

    for (const egress of egresses ?? []) {
      scanned++;

      // Conservative: skip if we don't know the age (missing startedAt or wrong type)
      if (!egress.startedAt || typeof egress.startedAt !== 'bigint') {
        continue;
      }

      // Skip too-young egresses — may still be mid-commit
      if (egress.startedAt > thirtyMinAgoNanos) {
        continue;
      }

      // Cross-check: is this egress tracked in our junction?
      const { data: junctionRow } = await db
        .from('htg_meeting_egresses' as any)
        .select('id')
        .eq('egress_id', egress.egressId)
        .maybeSingle();

      if (junctionRow) continue;  // tracked, not orphan

      // Cross-check pending table for the session (two-phase commit window)
      if (sess) {
        const { data: pending } = await db
          .from('htg_meeting_pending_egresses' as any)
          .select('id')
          .eq('meeting_session_id', (sess as { id: string }).id)
          .gt('created_at', thirtyMinAgoIso)
          .maybeSingle();
        if (pending) continue;  // race window, skip
      }

      // True orphan: not in junction, not in pending, older than 30min — stop it
      try {
        await stopEgress(egress.egressId);
        await auditHtgRecording(db, null, egress.egressId, 'egress_force_abandoned', {
          room: room.name,
          reason: 'orphan_reaper_age_30min',
          egress_started_at: egress.startedAt.toString(),
        });
        orphansStopped++;
      } catch (e) {
        console.error('[orphan-reaper] stopEgress failed:', egress.egressId, e);
      }
    }
  }

  console.log(
    `[orphan-reaper] rooms=${meetingRooms.length} scanned=${scanned} orphansStopped=${orphansStopped}`,
  );
  return NextResponse.json({ ok: true, rooms: meetingRooms.length, scanned, orphansStopped });
}
