// ============================================================
// Analytics track egress helper — shared by admit/phase/consent routes
//
// Starts per-participant audio track egresses (startTrackEgress + DirectFileOutput)
// for the client-analysis pipeline. Writes raw Opus/Ogg tracks to R2, then
// inserts rows into analytics_track_egresses with file_url=NULL. The webhook
// fills in file_url when egress_ended fires.
//
// Separate from the legacy participant egress flow (session_publications) —
// these are audio-only track egresses keyed by audio track SID.
// ============================================================

import type { createSupabaseServiceRole } from '@/lib/supabase/service';
import { listRoomParticipants, startAudioTrackEgress } from '@/lib/live/livekit';
import { ParticipantInfo_State, TrackType, TrackSource } from 'livekit-server-sdk';
import { ParticipantInfo_Kind } from '@livekit/protocol';

export type AnalyticsPhase = 'wstep' | 'sesja' | 'podsumowanie';

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRole>;

interface HelperResult {
  started: number;
  eligible: number;
}

/**
 * Start analytics audio track egresses for all eligible participants in a phase.
 *
 * - Feature flag: if CLIENT_ANALYTICS_ENABLED !== 'true', returns immediately (no cost).
 * - Race guard: if any rows exist for (live_session_id, phase), returns early
 *   (prevents concurrent starts from phase/route.ts and consent/route.ts).
 * - Retry: if no tracks started but eligible human participants exist (mobile permission
 *   delay / media negotiation), waits 2s and retries once.
 * - Graceful degradation: individual egress failures are logged but don't stop the loop.
 *
 * Returns `{started, eligible}` — started = successful egresses, eligible = human
 * participants after filters (observers, EGRESS/AGENT/SIP, inactive).
 */
export async function startAllAnalyticsAudioTrackEgresses(
  db: SupabaseServiceClient,
  roomName: string,
  phase: AnalyticsPhase,
  liveSessionId: string,
): Promise<HelperResult> {
  // Feature flag — centralized check (off in prod until PRE-1 and PRE-2 complete)
  if (process.env.CLIENT_ANALYTICS_ENABLED !== 'true') {
    return { started: 0, eligible: 0 };
  }

  // Race guard — if analytics already started for (session, phase), skip
  const { count: existingCount } = await db
    .from('analytics_track_egresses')
    .select('id', { count: 'exact', head: true })
    .eq('live_session_id', liveSessionId)
    .eq('phase', phase);
  if (existingCount && existingCount > 0) {
    return { started: 0, eligible: 0 };
  }

  // First pass
  let participants;
  try {
    participants = await listRoomParticipants(roomName);
  } catch (e) {
    console.warn(`[analytics] listRoomParticipants failed phase=${phase}:`, e);
    throw e;
  }
  let result = await tryStartForParticipants(db, roomName, phase, liveSessionId, participants);

  // Retry once after 2s if we have eligible participants but none published audio yet.
  // Covers mobile permission delay, BT switching, slow ICE negotiation.
  if (result.started === 0 && result.eligible > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      participants = await listRoomParticipants(roomName);
      const retry = await tryStartForParticipants(db, roomName, phase, liveSessionId, participants);
      result = retry;
    } catch (e) {
      console.warn(`[analytics] retry listRoomParticipants failed phase=${phase}:`, e);
    }
  }

  console.log(
    `[analytics] phase=${phase} started=${result.started}/${result.eligible} session=${liveSessionId}`,
  );
  return result;
}

interface ParticipantTrackLike {
  sid?: string;
  type?: TrackType;
  source?: TrackSource;
}

interface ParticipantLike {
  identity?: string;
  kind?: ParticipantInfo_Kind;
  state?: ParticipantInfo_State;
  metadata?: string;
  tracks?: ParticipantTrackLike[];
}

async function tryStartForParticipants(
  db: SupabaseServiceClient,
  roomName: string,
  phase: AnalyticsPhase,
  liveSessionId: string,
  participants: ParticipantLike[],
): Promise<HelperResult> {
  let started = 0;
  let eligible = 0;

  for (const p of participants) {
    if (!p.identity) continue;

    // Positive filter on kind — only human participants (STANDARD + INGRESS).
    // Excludes EGRESS, AGENT, SIP, CONNECTOR, BRIDGE, and any future enum values.
    if (
      p.kind !== ParticipantInfo_Kind.STANDARD &&
      p.kind !== ParticipantInfo_Kind.INGRESS
    ) continue;

    // Fail-closed metadata parsing — staff tokens always carry valid JSON.
    // Unparseable metadata is treated as untrusted → skip.
    let meta: { isObserver?: boolean; isStaff?: boolean } = {};
    try {
      meta = p.metadata ? JSON.parse(p.metadata) : {};
    } catch {
      continue;
    }
    if (meta.isObserver === true) continue;
    if (p.state !== ParticipantInfo_State.ACTIVE) continue;

    // Count as eligible BEFORE checking audio track — retry logic needs this
    // to trigger when human participants exist but haven't published audio yet.
    eligible++;

    const audioTrack = (p.tracks ?? []).find(
      (t) => t.type === TrackType.AUDIO && t.source === TrackSource.MICROPHONE,
    );
    if (!audioTrack?.sid) {
      console.warn(`[analytics] no audio track for ${p.identity} phase=${phase}`);
      continue;
    }

    try {
      const egress = await startAudioTrackEgress(roomName, audioTrack.sid, p.identity);
      const { error } = await db.from('analytics_track_egresses').insert({
        live_session_id: liveSessionId,
        phase,
        participant_identity: p.identity,
        track_sid: audioTrack.sid,
        egress_id: egress.egressId,
      });
      if (error) {
        console.warn(
          `[analytics] insert failed for ${p.identity} phase=${phase}:`,
          error.message,
        );
        continue;
      }
      started++;
    } catch (e) {
      console.warn(
        `[analytics] startAudioTrackEgress failed for ${p.identity} phase=${phase}:`,
        e,
      );
    }
  }

  return { started, eligible };
}
