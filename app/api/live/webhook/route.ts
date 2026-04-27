import { NextRequest, NextResponse } from 'next/server';
import {
  getWebhookReceiver,
  startParticipantEgress,
  stopEgress,
} from '@/lib/live/livekit';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { extractR2ObjectKey } from '@/lib/r2-presigned';
import {
  HTG_MEETING_ROOM_PREFIX,
  CONSENT_VERSION_KEY,
  UUID_RE,
  auditHtgRecording,
  computeDurationFromEgress,
} from '@/lib/live/meeting-constants';
import { readSiteSettingString } from '@/lib/site-settings';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const RECORDING_TYPES = ['natalia_solo', 'natalia_asysta', 'natalia_para'];

type RecordingPhase = 'wstep' | 'sesja' | 'podsumowanie';

interface SessionLike {
  id: string;
  booking_id: string;
  egress_wstep_id: string | null;
  egress_sesja_id: string | null;
  egress_podsumowanie_id: string | null;
  started_at?: string | null;
  sesja_started_at?: string | null;
  podsumowanie_started_at?: string | null;
}

/**
 * Match an egress ID to its session phase by checking the corresponding
 * column in live_sessions. Returns null if the egress is a track egress
 * (per-participant) or doesn't belong to this session.
 */
function matchEgressPhase(session: SessionLike, egressId: string): RecordingPhase | null {
  if (session.egress_wstep_id === egressId) return 'wstep';
  if (session.egress_sesja_id === egressId) return 'sesja';
  if (session.egress_podsumowanie_id === egressId) return 'podsumowanie';
  return null;
}

/**
 * Get the recording_started_at timestamp for a given phase.
 * Falls back to current time if the column is missing.
 */
function getPhaseStartedAt(session: SessionLike, phase: RecordingPhase): string {
  if (phase === 'wstep') return session.started_at ?? new Date().toISOString();
  if (phase === 'sesja') return session.sesja_started_at ?? new Date().toISOString();
  return session.podsumowanie_started_at ?? new Date().toISOString();
}

/**
 * Get the title prefix for a recording based on phase.
 */
function getPhaseTitle(phase: RecordingPhase, dateStr: string | null): string {
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  if (phase === 'wstep') return `Wstęp — ${date}`;
  if (phase === 'sesja') return `Sesja — ${date}`;
  return `Podsumowanie — ${date}`;
}

/**
 * Min duration threshold per phase.
 * Wstep/podsumowanie can be very short (admin-only material), so use 10s.
 * Sesja uses the default (60s) to ignore brief technical fragments.
 */
function getMinDurationSeconds(phase: RecordingPhase): number {
  return phase === 'sesja' ? 60 : 10;
}

async function auditRecording(
  db: ReturnType<typeof createSupabaseServiceRole>,
  recordingId: string,
  action: string,
  details: Record<string, unknown> = {}
) {
  await db.from('booking_recording_audit').insert({
    recording_id: recordingId,
    action,
    actor_id: SYSTEM_ACTOR,
    details,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const authHeader = request.headers.get('Authorization') ?? '';

    let receiver;
    try {
      receiver = getWebhookReceiver();
    } catch {
      console.warn('[webhook] LiveKit webhook secret missing — skipping signature verification');
      return NextResponse.json({ ok: true });
    }

    const event = await receiver.receive(body, authHeader);

    // ============================================================
    // HTG MEETINGS HANDLERS (PR #5, plan v9)
    // ============================================================
    // Filtered by HTG_MEETING_ROOM_PREFIX. Each handler early-returns on
    // match so HTG events do not fall through into the live_sessions
    // booking_recordings code path below.
    //
    // 4 events:
    //   - egress_started      → htg_meeting_recordings_v2 row (queued)
    //   - egress_ended        → finalize source_url + duration + resurrect
    //   - participant_joined  → late-joiner track egress (two-phase commit)
    //   - participant_left    → stopEgress + fail-closed
    //
    // Audit helper auditHtgRecording is imported from meeting-constants
    // (single source of truth, MeetingAuditAction TS enforcement — v9 C1).
    {
      // ── HTG 1: egress_started → recordings_v2 + race lookup ─────────
      if (event.event === 'egress_started' && event.egressInfo) {
        const egressInfo = event.egressInfo;
        const egressId = egressInfo.egressId;
        const roomName = egressInfo.roomName ?? '';

        if (roomName.startsWith(HTG_MEETING_ROOM_PREFIX)) {
          const supabase = createSupabaseServiceRole();

          // Lookup junction row by egress_id
          const { data: egressRow } = await supabase
            .from('htg_meeting_egresses' as any)
            .select('id, meeting_session_id, egress_kind, participant_user_id')
            .eq('egress_id', egressId)
            .maybeSingle();

          if (!egressRow) {
            // Junction missing — could be real orphan OR webhook ahead of
            // control/start commit. Two-step pending lookup (room → session → pending)
            // with 1-min freshness window so stale pending rows don't mask orphans.
            const { data: sess } = await supabase
              .from('htg_meeting_sessions' as any)
              .select('id')
              .eq('room_name', roomName)
              .maybeSingle();

            let pendingFound = false;
            if (sess) {
              const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
              const { data: pending } = await supabase
                .from('htg_meeting_pending_egresses' as any)
                .select('id')
                .eq('meeting_session_id', (sess as any).id)
                .gt('created_at', oneMinAgo)
                .limit(1);
              pendingFound = (pending?.length ?? 0) > 0;
            }

            if (pendingFound) {
              // Race: webhook ahead of control/start commit. Junction will arrive
              // within ms, egress_ended will find it. NO stopEgress kill.
              await auditHtgRecording(supabase, null, egressId, 'race_webhook_ahead_of_commit', {
                room: roomName,
              });
            } else {
              // True orphan — Section 10 reaper handles cleanup after 30min TTL.
              // NO stopEgress here (fail-closed: don't kill legal egresses mid-commit).
              await auditHtgRecording(supabase, null, egressId, 'egress_orphan_started', {
                room: roomName,
              });
            }
            return NextResponse.json({ ok: true });
          }

          // Junction found — create/upsert recordings_v2 row (status='queued')
          const er = egressRow as any;
          const { data: meetingSession } = await supabase
            .from('htg_meeting_sessions' as any)
            .select('meeting_id, started_at, scheduled_at')
            .eq('id', er.meeting_session_id)
            .maybeSingle();

          const ms = meetingSession as { meeting_id?: string; started_at?: string; scheduled_at?: string } | null;
          const sessionDate = (ms?.started_at ?? ms?.scheduled_at ?? new Date().toISOString()).slice(0, 10);

          // Upsert — egress_ended may have already created a partial row
          // (out-of-order webhook delivery). source_url/duration not touched here;
          // only egress_started fills recording_started_at + metadata.
          await supabase.from('htg_meeting_recordings_v2' as any).upsert({
            egress_id: egressId,
            meeting_session_id: er.meeting_session_id,
            meeting_id: ms?.meeting_id ?? null,
            recording_kind: er.egress_kind,
            participant_user_id: er.participant_user_id,
            recording_started_at: new Date().toISOString(),
            session_date: sessionDate,
            status: 'queued',
            expires_at: null,
          }, { onConflict: 'egress_id', ignoreDuplicates: false });

          await auditHtgRecording(supabase, null, egressId, 'egress_started', {
            kind: er.egress_kind,
          });
          return NextResponse.json({ ok: true });
        }
      }

      // ── HTG 2: egress_ended → finalize + resurrect path ────────────
      if (event.event === 'egress_ended' && event.egressInfo) {
        const egressInfo = event.egressInfo;
        const egressId = egressInfo.egressId;
        const roomName = egressInfo.roomName ?? '';

        if (roomName.startsWith(HTG_MEETING_ROOM_PREFIX)) {
          const supabase = createSupabaseServiceRole();

          const { data: egressRow } = await supabase
            .from('htg_meeting_egresses' as any)
            .select('id, meeting_session_id, egress_kind, participant_user_id, started_at')
            .eq('egress_id', egressId)
            .maybeSingle();

          if (!egressRow) {
            // No junction — webhook arrived but no INSERT happened. Possibly
            // a true orphan. NO stopEgress (Section 10 reaper handles cleanup).
            await auditHtgRecording(supabase, null, egressId, 'egress_orphan_ended', {
              room: roomName,
            });
            return NextResponse.json({ ok: true });
          }

          const er = egressRow as any;
          const fileUrl = egressInfo.fileResults?.[0]?.location ?? null;
          const durationSeconds = computeDurationFromEgress({
            startedAt: egressInfo.startedAt as bigint | number | undefined,
            endedAt: egressInfo.endedAt as bigint | number | undefined,
          });

          // Update junction first — control/end may have already set ended_at,
          // so use is('ended_at', null) guard to avoid clobbering.
          await supabase.from('htg_meeting_egresses' as any).update({
            ended_at: new Date().toISOString(),
            source_url: fileUrl ? extractR2ObjectKey(fileUrl) : null,
            duration_seconds: durationSeconds,
          }).eq('id', er.id).is('ended_at', null);

          // Lookup parent session for date
          const { data: meetingSession } = await supabase
            .from('htg_meeting_sessions' as any)
            .select('meeting_id, started_at, scheduled_at')
            .eq('id', er.meeting_session_id)
            .maybeSingle();

          const ms = meetingSession as { meeting_id?: string; started_at?: string; scheduled_at?: string } | null;
          const sessionDate = (ms?.started_at ?? ms?.scheduled_at ?? new Date().toISOString()).slice(0, 10);

          // Resurrect path (v7 fix #7): SELECT previous status BEFORE upsert.
          // If existing row is failed with 'egress_ended_never_received',
          // late egress_ended arriving means we should bring it back to queued.
          // Audit only fires when transition matches.
          const { data: previousRec } = await supabase
            .from('htg_meeting_recordings_v2' as any)
            .select('status, last_error')
            .eq('egress_id', egressId)
            .maybeSingle();

          // Upsert recordings_v2 with finalized data
          await supabase.from('htg_meeting_recordings_v2' as any).upsert({
            egress_id: egressId,
            meeting_session_id: er.meeting_session_id,
            meeting_id: ms?.meeting_id ?? null,
            recording_kind: er.egress_kind,
            participant_user_id: er.participant_user_id,
            source_url: fileUrl ? extractR2ObjectKey(fileUrl) : null,
            duration_seconds: durationSeconds,
            session_date: sessionDate,
            status: 'queued',
            last_error: null,
            expires_at: null,
            // recording_started_at NOT set here — egress_started fills it.
          }, { onConflict: 'egress_id', ignoreDuplicates: false });

          // Resurrect audit if previous was failed-stuck
          const pr = previousRec as { status?: string; last_error?: string } | null;
          if (pr?.status === 'failed' && pr?.last_error === 'egress_ended_never_received') {
            await auditHtgRecording(supabase, null, egressId, 'upload_resurrect_after_late_ended', {
              previous_status: pr.status,
              previous_error: pr.last_error,
            });
          }

          await auditHtgRecording(supabase, null, egressId, 'egress_ended', {
            duration: durationSeconds,
            kind: er.egress_kind,
          });
          return NextResponse.json({ ok: true });
        }
      }

      // ── HTG 3: participant_joined → late-joiner track egress ──────
      if (event.event === 'participant_joined' && event.room && event.participant) {
        const roomName = event.room.name;

        if (roomName.startsWith(HTG_MEETING_ROOM_PREFIX)) {
          const identity = event.participant.identity;

          // Skip observers (admin/practitioner ghost peek — hidden, no track needed)
          if (identity.startsWith('__obs__')) {
            return NextResponse.json({ ok: true });
          }

          // Parse user_id from sanitized identity "uuid:displayName"
          const firstColon = identity.indexOf(':');
          const userId = firstColon > 0 ? identity.slice(0, firstColon) : identity;
          if (!UUID_RE.test(userId)) {
            return NextResponse.json({ ok: true });
          }

          const supabase = createSupabaseServiceRole();

          // Find session by room_name + check composite_recording_started flag
          const { data: session } = await supabase
            .from('htg_meeting_sessions' as any)
            .select('id, composite_recording_started')
            .eq('room_name', roomName)
            .maybeSingle();

          const sess = session as { id?: string; composite_recording_started?: boolean } | null;
          if (!sess?.composite_recording_started || !sess.id) {
            // No session OR composite not started yet — late joiner before recording
            // start (control/start hasn't fired yet). Track will be picked up by the
            // control/start per-track loop when it runs.
            return NextResponse.json({ ok: true });
          }

          const sessionId = sess.id;
          const currentVersion = await readSiteSettingString(supabase, CONSENT_VERSION_KEY);

          // Retry loop: join/route.ts inserts participant row with status='joined'
          // shortly before token is returned, but LiveKit webhook delivery is
          // at-most-once and may race. v8 fix: short backoff (max 750ms total)
          // to stay within Vercel serverless function timeout budget.
          type Participant = {
            user_id: string;
            recording_consent_at: string | null;
            recording_consent_version: string | null;
          };
          let participant: Participant | null = null;
          const retryDelays = [0, 250, 500];
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelays[attempt]));
            const { data } = await supabase
              .from('htg_meeting_participants' as any)
              .select('user_id, recording_consent_at, recording_consent_version')
              .eq('session_id', sessionId)
              .eq('user_id', userId)
              .eq('status', 'joined')
              .maybeSingle();
            if (data) {
              participant = data as unknown as Participant;
              break;
            }
          }

          if (!participant) {
            // 3x retry exhausted — DB commit from join/route.ts didn't catch up.
            // Audit and return; track loss for one late-joiner is acceptable
            // vs handler timeout for every late join.
            await auditHtgRecording(supabase, null, null, 'participant_joined_before_db_commit', {
              user_id: userId,
              room: roomName,
            });
            return NextResponse.json({ ok: true });
          }

          // Consent gate: must have timestamp AND match current version
          if (
            !participant.recording_consent_at ||
            participant.recording_consent_version !== currentVersion
          ) {
            await auditHtgRecording(supabase, null, null, 'consent_missing_at_track_start', {
              user_id: userId,
              has_timestamp: !!participant.recording_consent_at,
              version_mismatch: participant.recording_consent_version !== currentVersion,
            });
            return NextResponse.json({ ok: true });
          }

          // Two-phase commit (v6 fix #5): pending INSERT → startEgress → junction INSERT
          // → DELETE pending. No `finally` — on junction INSERT failure, we leave
          // pending row + stopEgress, so reaper retries cleanup.
          const clientRequestId = crypto.randomUUID();
          await supabase.from('htg_meeting_pending_egresses' as any).insert({
            client_request_id: clientRequestId,
            meeting_session_id: sessionId,
            egress_kind: 'track',
            participant_user_id: userId,
            participant_identity: identity,
          });

          let startSucceeded = false;
          try {
            const egress = await startParticipantEgress(roomName, identity);
            startSucceeded = true;

            const { error: insertError } = await supabase
              .from('htg_meeting_egresses' as any)
              .insert({
                meeting_session_id: sessionId,
                egress_id: egress.egressId,
                egress_kind: 'track',
                participant_user_id: userId,
                participant_identity: identity,
              });

            if (insertError?.code === '23505') {
              // Race with control/start per-track loop — stop our duplicate.
              try {
                await stopEgress(egress.egressId);
              } catch (stopErr) {
                await auditHtgRecording(supabase, null, egress.egressId, 'ghost_egress_junction_failed', {
                  reason: 'participant_joined_race_stop_failed',
                  user_id: userId,
                  error: String(stopErr),
                });
                throw stopErr;
              }
            } else if (insertError) {
              // Junction INSERT failed for other reason — explicit stop.
              try {
                await stopEgress(egress.egressId);
              } catch (stopErr) {
                await auditHtgRecording(supabase, null, egress.egressId, 'ghost_egress_junction_failed', {
                  reason: 'participant_joined_insert_error',
                  user_id: userId,
                  insert_error: insertError.message,
                  stop_error: String(stopErr),
                });
                throw stopErr;
              }
              throw insertError;
            } else {
              // Success path
              await auditHtgRecording(supabase, null, egress.egressId, 'late_joiner_egress_started', {
                user_id: userId,
              });
            }

            // Delete pending row only after both startEgress + junction INSERT (or recovery)
            await supabase
              .from('htg_meeting_pending_egresses' as any)
              .delete()
              .eq('client_request_id', clientRequestId);
          } catch (e) {
            if (!startSucceeded) {
              // startEgress failed — safe to delete pending (no LiveKit egress exists)
              await supabase
                .from('htg_meeting_pending_egresses' as any)
                .delete()
                .eq('client_request_id', clientRequestId);
            }
            // If startSucceeded but junction failed, pending stays — Section 10 reaper
            // handles cleanup after 30min TTL.
            console.error('[webhook/htg participant_joined] track egress failed:', identity, e);
          }

          return NextResponse.json({ ok: true });
        }
      }

      // ── HTG 4: participant_left → stopEgress + fail-closed ────────
      if (event.event === 'participant_left' && event.room && event.participant) {
        const roomName = event.room.name;

        if (roomName.startsWith(HTG_MEETING_ROOM_PREFIX)) {
          const identity = event.participant.identity;

          if (identity.startsWith('__obs__')) {
            return NextResponse.json({ ok: true });
          }

          const firstColon = identity.indexOf(':');
          const userId = firstColon > 0 ? identity.slice(0, firstColon) : identity;
          if (!UUID_RE.test(userId)) {
            return NextResponse.json({ ok: true });
          }

          const supabase = createSupabaseServiceRole();

          const { data: session } = await supabase
            .from('htg_meeting_sessions' as any)
            .select('id')
            .eq('room_name', roomName)
            .maybeSingle();

          const sess = session as { id?: string } | null;
          if (!sess?.id) {
            return NextResponse.json({ ok: true });
          }

          // Find active track egress for this user (not yet ended_at)
          const { data: activeEgress } = await supabase
            .from('htg_meeting_egresses' as any)
            .select('id, egress_id')
            .eq('meeting_session_id', sess.id)
            .eq('participant_user_id', userId)
            .eq('egress_kind', 'track')
            .is('ended_at', null)
            .maybeSingle();

          const ae = activeEgress as { id?: string; egress_id?: string } | null;
          if (!ae?.id || !ae?.egress_id) {
            return NextResponse.json({ ok: true });
          }

          // stopEgress first — only mark ended_at on success.
          // Fail-closed: if stop throws, keep ended_at NULL + record stop_error.
          // Section 7 reaper retries later.
          try {
            await stopEgress(ae.egress_id);
            await supabase
              .from('htg_meeting_egresses' as any)
              .update({
                ended_at: new Date().toISOString(),
                stop_error: null,
              })
              .eq('id', ae.id)
              .is('ended_at', null);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            await supabase
              .from('htg_meeting_egresses' as any)
              .update({ stop_error: errMsg })
              .eq('id', ae.id)
              .is('ended_at', null);
            await auditHtgRecording(supabase, null, ae.egress_id, 'egress_stop_failed', {
              reason: 'participant_left',
              error: errMsg,
            });
          }

          return NextResponse.json({ ok: true });
        }
      }
    }
    // ============================================================
    // END HTG Meetings handlers — fall through to live_sessions below
    // ============================================================

    // ── 1. egress_ended → live_sessions URL update (all 3 phases) ─────────
    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const supabase = createSupabaseServiceRole();

      // Find session matching any of the 3 composite egress columns
      const { data: session } = await supabase
        .from('live_sessions')
        .select('id, egress_wstep_id, egress_sesja_id, egress_podsumowanie_id')
        .or(
          `egress_wstep_id.eq.${egressId},` +
          `egress_sesja_id.eq.${egressId},` +
          `egress_podsumowanie_id.eq.${egressId}`
        )
        .maybeSingle();

      if (session) {
        const fileUrl = egress.fileResults?.[0]?.location ?? null;
        if (fileUrl) {
          const urlColumn =
            session.egress_wstep_id       === egressId ? 'recording_wstep_url' :
            session.egress_sesja_id       === egressId ? 'recording_sesja_url' :
                                                         'recording_podsumowanie_url';

          await supabase
            .from('live_sessions')
            .update({ [urlColumn]: fileUrl })
            .eq('id', session.id);
        }
      }

      // ── 2. Individual track recordings — via atomic RPC (legacy) ────────
      const fileUrl = egress.fileResults?.[0]?.location ?? null;

      if (fileUrl && !session) {
        // Not a composite — try legacy sesja tracks first, then analytics
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('complete_session_track_egress', {
            p_egress_id: egressId,
            p_file_url:  fileUrl,
          });

        const legacyRow = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        const legacyMatched = !!legacyRow?.session_id;

        if (rpcError) {
          console.error('[webhook] complete_session_track_egress RPC error:', rpcError.message);
        } else if (legacyMatched) {
          // Legacy match — auto-create session_publication when all tracks done
          if (legacyRow.all_tracks_done && legacyRow.session_id) {
            const { data: existingPub } = await supabase
              .from('session_publications')
              .select('id')
              .eq('live_session_id', legacyRow.session_id)
              .maybeSingle();

            if (!existingPub) {
              const { data: fullSession } = await supabase
                .from('live_sessions')
                .select('id, room_name, created_at, recording_sesja_tracks, recording_sesja_url')
                .eq('id', legacyRow.session_id)
                .single();

              if (fullSession) {
                const recordingTracks =
                  (fullSession.recording_sesja_tracks as Record<string, string>) ?? {};

                const sourceTracks = Object.entries(recordingTracks).map(
                  ([pId, url]) => ({ name: pId.slice(0, 20), url })
                );

                const sessionDate = new Date(fullSession.created_at).toLocaleDateString('pl-PL', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                });

                const { error: insertError } = await supabase
                  .from('session_publications')
                  .insert({
                    title:                `Sesja ${sessionDate} — ${fullSession.room_name ?? legacyRow.session_id.slice(0, 8)}`,
                    live_session_id:      legacyRow.session_id,
                    status:               'raw',
                    source_tracks:        sourceTracks,
                    source_composite_url: fullSession.recording_sesja_url ?? null,
                    created_at:           new Date().toISOString(),
                    updated_at:           new Date().toISOString(),
                  });

                if (insertError && !insertError.code?.includes('23505')) {
                  console.error('[webhook] auto-create publication error:', insertError.message);
                } else if (!insertError) {
                  console.log(`[webhook] Auto-created session_publication for live session ${legacyRow.session_id}`);
                }
              }
            }
          }
        } else {
          // 2b. Not legacy — try analytics track egresses (separate pipeline)
          const { data: analyticsRow, error: analyticsErr } = await supabase
            .from('analytics_track_egresses')
            .update({ file_url: fileUrl, ended_at: new Date().toISOString() })
            .eq('egress_id', egressId)
            .is('file_url', null)
            .select('id, live_session_id, phase')
            .maybeSingle();

          if (analyticsErr) {
            console.error('[webhook] analytics_track_egresses update error:', analyticsErr.message);
          } else if (!analyticsRow) {
            console.warn('[webhook] Unknown track egress:', egressId);
          }
        }
      }
    }

    // ── 3. egress_started → booking_recordings UPSERT (all 3 phases) ──────
    // Creates the record immediately when recording starts (duration_seconds = NULL)
    // Cron skips records with duration_seconds IS NULL until egress_ended updates them.
    //
    // Conditional UPSERT: if a record already exists (egress_ended arrived first
    // due to webhook reordering), don't clobber duration_seconds/source_url/status.
    if (event.event === 'egress_started' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const db = createSupabaseServiceRole();

      // Find session matching any of 3 composite egress columns
      const { data: recSessionRaw } = await db
        .from('live_sessions')
        .select(
          'id, booking_id, started_at, sesja_started_at, podsumowanie_started_at, ' +
          'egress_wstep_id, egress_sesja_id, egress_podsumowanie_id, ' +
          'booking:bookings(session_type, user_id), slot:booking_slots(slot_date)'
        )
        .or(
          `egress_wstep_id.eq.${egressId},` +
          `egress_sesja_id.eq.${egressId},` +
          `egress_podsumowanie_id.eq.${egressId}`
        )
        .maybeSingle();

      const recSession = recSessionRaw as unknown as (SessionLike & {
        booking?: { session_type?: string; user_id?: string } | null;
        slot?: { slot_date?: string } | null;
      }) | null;

      if (recSession?.booking_id) {
        const phase = matchEgressPhase(recSession, egressId);
        const sessionType = (recSession.booking as unknown as Record<string, unknown>)?.session_type as string | undefined;

        if (phase && sessionType && RECORDING_TYPES.includes(sessionType)) {
          const slotDate = (recSession.slot as unknown as Record<string, unknown>)?.slot_date as string | undefined;
          const fileUrl = egress.fileResults?.[0]?.location ?? null;
          const sourceKey = fileUrl ? extractR2ObjectKey(fileUrl) : null;
          // sesja phase → permanent (legal_hold); wstep/podsumowanie → 365-day retention (admin-only)
          const isSesjaPhase = phase === 'sesja';
          const retentionDays = 365;
          const startedAt = getPhaseStartedAt(recSession as SessionLike, phase);
          const title = getPhaseTitle(phase, slotDate ?? null);
          const minDuration = getMinDurationSeconds(phase);

          // Check if a record already exists (out-of-order webhook: ended arrived first)
          const { data: existing } = await db
            .from('booking_recordings')
            .select('id, duration_seconds, source_url, status')
            .eq('egress_id', egressId)
            .maybeSingle();

          if (existing) {
            // Existing record: only update startup fields, preserve duration/source/status
            // unless duration_seconds is set (egress_ended arrived) — then unstick from 'failed'.
            const updates: Record<string, unknown> = {
              recording_phase: phase,
              recording_started_at: startedAt,
              title,
              min_duration_seconds: minDuration,
              updated_at: new Date().toISOString(),
            };
            // If duration is already set (egress_ended ran), promote 'failed' → 'queued' for cron pickup
            if (existing.duration_seconds != null && existing.status === 'failed') {
              updates.status = 'queued';
              updates.last_error = null;
            }
            await db.from('booking_recordings').update(updates).eq('id', existing.id);
            console.log(`[webhook] Updated existing booking_recording ${existing.id} on egress_started (out-of-order)`);
          } else {
            // Normal flow: insert new record
            const { data: newRec, error: insertErr } = await db
              .from('booking_recordings')
              .insert({
                booking_id: recSession.booking_id,
                live_session_id: recSession.id,
                egress_id: egressId,
                recording_phase: phase,
                session_type: sessionType,
                session_date: slotDate ?? null,
                recording_started_at: startedAt,
                source: 'live',
                status: 'queued',
                source_url: sourceKey,
                duration_seconds: null,
                title,
                min_duration_seconds: minDuration,
                // sesja = "Nagrania Twoich Sesji" → legal_hold bypasses all retention checks
                legal_hold: isSesjaPhase,
                expires_at: isSesjaPhase
                  ? '2099-12-31T23:59:59Z'
                  : slotDate
                    ? new Date(new Date(slotDate).getTime() + retentionDays * 86400000).toISOString()
                    : new Date(Date.now() + retentionDays * 86400000).toISOString(),
              })
              .select('id')
              .single();

            if (insertErr && insertErr.code !== '23505') {
              console.error('[webhook] booking_recordings insert (egress_started) error:', insertErr.message);
            } else if (!insertErr && newRec) {
              console.log(`[webhook] Created booking recording ${newRec.id} for ${phase} egress ${egressId}`);
              await auditRecording(db, newRec.id, 'recording_created', {
                booking_id: recSession.booking_id,
                egress_id: egressId,
                recording_phase: phase,
              });
            }
          }
        }
      }
    }

    // ── 4. egress_ended → booking_recordings UPDATE duration_seconds (all 3 phases) ──
    // Updates the record created by egress_started with final duration and source key.
    // RETRY-SAFE: looks up booking_recordings by egress_id FIRST (independent of
    // live_sessions state), so old segments survive even after retry replaces
    // egress_sesja_id. If no record found, falls back to live_sessions matching
    // and creates a 'failed' record for manual review.
    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const db = createSupabaseServiceRole();

      const fileUrl = egress.fileResults?.[0]?.location ?? null;
      const sourceKey = fileUrl ? extractR2ObjectKey(fileUrl) : null;

      // Compute duration from LiveKit timestamps
      let durationSeconds: number | null = null;
      if (egress.endedAt && egress.startedAt) {
        const startMs = typeof egress.startedAt === 'bigint'
          ? Number(egress.startedAt) / 1_000_000
          : Number(egress.startedAt);
        const endMs = typeof egress.endedAt === 'bigint'
          ? Number(egress.endedAt) / 1_000_000
          : Number(egress.endedAt);
        const diff = endMs - startMs;
        durationSeconds = diff > 1e12 ? Math.round(diff / 1_000_000_000) : Math.round(diff / 1000);
        if (durationSeconds <= 0) durationSeconds = null;
      }

      // ── PRIMARY LOOKUP: by egress_id in booking_recordings ──────────────
      // Survives retry-recording: even if live_sessions.egress_sesja_id was
      // overwritten with a new ID, the old booking_recordings row still has
      // the old egress_id and gets finalized properly.
      const { data: existing } = await db
        .from('booking_recordings')
        .select('id, recording_phase')
        .eq('egress_id', egressId)
        .maybeSingle();

      if (existing) {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (durationSeconds != null) updates.duration_seconds = durationSeconds;
        if (sourceKey) updates.source_url = sourceKey;

        await db.from('booking_recordings').update(updates).eq('id', existing.id);
        console.log(`[webhook] Updated booking recording ${existing.id} (${existing.recording_phase}) with duration=${durationSeconds}s`);
        return NextResponse.json({ ok: true });
      }

      // ── FALLBACK LOOKUP: by live_sessions match ─────────────────────────
      // Either egress_started never arrived, or this egress is a track egress
      // (per-participant). Match against composite egress columns.
      const { data: recSessionRaw } = await db
        .from('live_sessions')
        .select(
          'id, booking_id, started_at, sesja_started_at, podsumowanie_started_at, ' +
          'egress_wstep_id, egress_sesja_id, egress_podsumowanie_id, ' +
          'booking:bookings(session_type), slot:booking_slots(slot_date)'
        )
        .or(
          `egress_wstep_id.eq.${egressId},` +
          `egress_sesja_id.eq.${egressId},` +
          `egress_podsumowanie_id.eq.${egressId}`
        )
        .maybeSingle();

      const recSession = recSessionRaw as unknown as (SessionLike & {
        booking?: { session_type?: string } | null;
        slot?: { slot_date?: string } | null;
      }) | null;

      if (!recSession?.booking_id) {
        // Not a composite booking recording (probably a track egress) — already
        // handled by section 2 above. Done.
        return NextResponse.json({ ok: true });
      }

      const phase = matchEgressPhase(recSession, egressId);
      if (!phase) {
        return NextResponse.json({ ok: true });
      }

      const sessionType = (recSession.booking as unknown as Record<string, unknown>)?.session_type as string | undefined;
      if (!sessionType || !RECORDING_TYPES.includes(sessionType)) {
        return NextResponse.json({ ok: true });
      }

      // Create as 'failed' for manual admin review (egress_started webhook missing)
      const slotDate = (recSession.slot as unknown as Record<string, unknown>)?.slot_date as string | undefined;
      const isSesjaPhase = phase === 'sesja';
      const retentionDays = 365;
      const startedAt = getPhaseStartedAt(recSession as SessionLike, phase);
      const title = getPhaseTitle(phase, slotDate ?? null);
      const minDuration = getMinDurationSeconds(phase);

      const { data: newRec, error: insertErr } = await db
        .from('booking_recordings')
        .insert({
          booking_id: recSession.booking_id,
          live_session_id: recSession.id,
          egress_id: egressId,
          recording_phase: phase,
          session_type: sessionType,
          session_date: slotDate ?? null,
          recording_started_at: startedAt,
          source: 'live',
          status: 'failed',
          source_url: sourceKey,
          duration_seconds: durationSeconds,
          last_error: 'egress_started_webhook_missing',
          title,
          min_duration_seconds: minDuration,
          // sesja = "Nagrania Twoich Sesji" → legal_hold bypasses all retention checks
          legal_hold: isSesjaPhase,
          expires_at: isSesjaPhase
            ? '2099-12-31T23:59:59Z'
            : slotDate
              ? new Date(new Date(slotDate).getTime() + retentionDays * 86400000).toISOString()
              : new Date(Date.now() + retentionDays * 86400000).toISOString(),
          metadata: { needs_manual_review: true, booking_id: recSession.booking_id },
        })
        .select('id')
        .single();

      if (insertErr && insertErr.code !== '23505') {
        console.error('[webhook] booking_recordings insert (egress_started missing) error:', insertErr.message);
      } else if (!insertErr && newRec) {
        console.warn(`[webhook] egress_started missing — created failed record ${newRec.id} for ${phase} egress ${egressId}`);
        await auditRecording(db, newRec.id, 'retry', {
          reason: 'egress_started_missing',
          egress_id: egressId,
          recording_phase: phase,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
