import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import {
  startRoomCompositeEgress,
  startParticipantEgress,
  stopEgress,
  listRoomParticipants,
  removeParticipant,
} from '@/lib/live/livekit';
import {
  acquireMeetingRecordingLock,
  releaseMeetingRecordingLock,
} from '@/lib/live/meeting-recording-lock';
import {
  UUID_RE,
  CONSENT_VERSION_KEY,
  auditHtgRecording,
} from '@/lib/live/meeting-constants';
import { canControlMeetingRecording } from '@/lib/live/recording-auth';
import { readSiteSettingString } from '@/lib/site-settings';

/**
 * PR #4 of the HTG Meeting Recording Pipeline (plan v8).
 *
 * POST /api/htg-meeting/session/[id]/control
 *
 * Moderator-facing endpoint for meeting lifecycle actions. Major rewrite:
 *
 * - `start`: consent gate with version check → lock acquisition →
 *   two-phase commit composite egress (pending → startEgress → junction → delete pending) →
 *   mark composite_recording_started → step 7.5 room-side consent re-check
 *   (removeParticipant for users without valid consent) → per-track egresses
 *   with the same two-phase pattern, observer filter, UUID regex, and
 *   23505 race handling.
 *
 * - `end`: Promise.allSettled stopEgress for all active egresses.
 *   Fail-closed: stop_error on failure, ended_at only on success.
 *   `.is('ended_at', null)` guard prevents overwriting webhook-set timestamps.
 *
 * - Other actions (next_question, next_stage, free_talk, skip_speaker,
 *   mute_all, mute_participant): preserved from origin/main behavior.
 */

const BodySchema = z.object({
  action: z.enum([
    'start',
    'next_question',
    'next_stage',
    'free_talk',
    'skip_speaker',
    'mute_all',
    'mute_participant',
    'end',
  ]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function pickRandom<T>(arr: T[], exclude?: T): T | null {
  const pool = exclude !== undefined ? arr.filter((x) => x !== exclude) : arr;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data: session } = await db
    .from('htg_meeting_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // v7 fix #14: canControlMeetingRecording is narrower than canControlRecording
  // — staff email alone is NOT sufficient for HTG meetings. Only admin or
  // the actual moderator of THIS session can control actions.
  const canControl = await canControlMeetingRecording(user.id, user.email, sessionId);
  if (!canControl) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 });
  }
  const { action, payload } = body;

  async function getJoinedParticipants(excludeModerator = false) {
    let query = db
      .from('htg_meeting_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('status', 'joined');
    if (excludeModerator) query = query.eq('is_moderator', false);
    const { data } = await query;
    return (data ?? []).map((p) => p.user_id);
  }

  async function getStages() {
    const { data } = await db
      .from('htg_meeting_stages')
      .select('id, order_index')
      .eq('meeting_id', session.meeting_id)
      .order('order_index');
    return data ?? [];
  }

  async function getQuestionsForStage(stageId: string) {
    const { data } = await db
      .from('htg_meeting_questions')
      .select('id, order_index')
      .eq('stage_id', stageId)
      .order('order_index');
    return data ?? [];
  }

  switch (action) {
    case 'start': {
      // 1. Consent gate: every joined participant + moderator must have valid
      //    consent with current version. Admins are excluded from the check
      //    (audited separately in join/route.ts as admin_bypass_consent_gate).
      const currentVersion = await readSiteSettingString(db, CONSENT_VERSION_KEY, 'v1-2026-04');

      const { data: missingConsentRaw } = await db
        .from('htg_meeting_participants')
        .select('email, display_name, user_id, is_moderator, recording_consent_at, recording_consent_version')
        .eq('session_id', sessionId)
        .eq('status', 'joined')
        .or(
          `recording_consent_at.is.null,recording_consent_version.neq.${currentVersion}`,
        );

      const missingConsent = (missingConsentRaw ?? []).filter(
        (p) => !isAdminEmail(p.email ?? ''),
      );

      if (missingConsent.length > 0) {
        return NextResponse.json(
          {
            error: 'Consent missing or outdated',
            missing: missingConsent.map((p) => ({
              email: p.email ?? p.display_name,
              isModerator: p.is_moderator,
              hasTimestamp: !!p.recording_consent_at,
              outdatedVersion: p.recording_consent_version !== currentVersion,
            })),
          },
          { status: 412 },
        );
      }

      // 2. Set session state (stages, questions, first speaker)
      const stages = await getStages();
      const firstStage = stages[0] ?? null;
      let firstQuestion = null;
      if (firstStage) {
        const questions = await getQuestionsForStage(firstStage.id);
        firstQuestion = questions[0] ?? null;
      }

      const participantsForSpeaker = await getJoinedParticipants(true);
      const speaker = pickRandom(participantsForSpeaker);

      await db
        .from('htg_meeting_sessions')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          current_stage_id: firstStage?.id ?? null,
          current_question_id: firstQuestion?.id ?? null,
          current_speaker_id: speaker,
        })
        .eq('id', sessionId);

      // 3. Acquire recording lock. If lock is held OR composite_recording_started
      //    is already true, return early (degraded but functional state).
      const lockAcquired = await acquireMeetingRecordingLock(sessionId);
      if (!lockAcquired) {
        return NextResponse.json({ ok: true, recording: false });
      }

      try {
        // 4. Idempotency check: does a composite egress already exist in junction?
        const { data: existingJunction } = await db
          .from('htg_meeting_egresses')
          .select('egress_id')
          .eq('meeting_session_id', sessionId)
          .eq('egress_kind', 'composite')
          .is('ended_at', null)
          .maybeSingle();

        let compositeEgressId: string;

        if (existingJunction) {
          compositeEgressId = existingJunction.egress_id;
          console.warn('[control/start] composite already in junction:', compositeEgressId);
        } else {
          // 5. Two-phase commit composite: pending row → startEgress → junction → delete pending
          const clientRequestId = crypto.randomUUID();
          await db.from('htg_meeting_pending_egresses').insert({
            client_request_id: clientRequestId,
            meeting_session_id: sessionId,
            egress_kind: 'composite',
            participant_user_id: null,
            participant_identity: null,
          });

          let startSucceeded = false;
          try {
            const composite = await startRoomCompositeEgress(session.room_name, {
              audioOnly: true,
            });
            compositeEgressId = composite.egressId;
            startSucceeded = true;

            const { error: insertError } = await db.from('htg_meeting_egresses').insert({
              meeting_session_id: sessionId,
              egress_id: compositeEgressId,
              egress_kind: 'composite',
              participant_user_id: null,
              participant_identity: null,
            });

            if (insertError?.code === '23505') {
              // Another process inserted composite meanwhile — stop ours
              console.warn('[control/start] composite race lost — stopping orphan');
              try {
                await stopEgress(compositeEgressId);
              } catch (stopErr) {
                await auditHtgRecording(db, null, compositeEgressId, 'ghost_egress_junction_failed', {
                  reason: 'race_lost_stop_failed',
                  error: String(stopErr),
                });
                throw stopErr;
              }
              // Re-fetch the winning composite id
              const { data: winner } = await db
                .from('htg_meeting_egresses')
                .select('egress_id')
                .eq('meeting_session_id', sessionId)
                .eq('egress_kind', 'composite')
                .is('ended_at', null)
                .single();
              if (winner) compositeEgressId = winner.egress_id;
            } else if (insertError) {
              try {
                await stopEgress(compositeEgressId);
              } catch (stopErr) {
                await auditHtgRecording(db, null, compositeEgressId, 'ghost_egress_junction_failed', {
                  reason: 'insert_error_stop_failed',
                  insert_error: insertError.message,
                  stop_error: String(stopErr),
                });
                throw stopErr;
              }
              throw insertError;
            }

            // Success path — delete pending
            await db
              .from('htg_meeting_pending_egresses')
              .delete()
              .eq('client_request_id', clientRequestId);
          } catch (startErr) {
            if (!startSucceeded) {
              await db
                .from('htg_meeting_pending_egresses')
                .delete()
                .eq('client_request_id', clientRequestId);
            }
            throw startErr;
          }
        }

        // 6. Mark composite started — this flag gates participant_joined webhook
        //    (PR #5) and join endpoint's consent gate.
        await db
          .from('htg_meeting_sessions')
          .update({
            composite_recording_started: true,
            recording_lock_until: null,
          })
          .eq('id', sessionId);

        // 7.5 + 8 (v9 H4): Single listRoomParticipants snapshot before 7.5.
        //     Previous code called listRoomParticipants twice (7.5 + step 8), which
        //     opened a race window where a late joiner appearing between the two
        //     calls would get a track egress in step 8 without going through the
        //     room-side consent re-check in 7.5. Track identities removed in 7.5
        //     via removedIdentities Set → step 8 filters them out.
        const roomParticipants = await listRoomParticipants(session.room_name);
        const removedIdentities = new Set<string>();

        // 7.5 Room-side consent re-check: removeParticipant for users without
        //     valid consent. Protects composite audio.
        for (const rp of roomParticipants) {
          if (rp.identity.startsWith('__obs__')) continue;
          const firstColon = rp.identity.indexOf(':');
          const rpUserId = firstColon > 0 ? rp.identity.slice(0, firstColon) : rp.identity;
          if (!UUID_RE.test(rpUserId)) continue;

          const { data: rpPart } = await db
            .from('htg_meeting_participants')
            .select('recording_consent_at, recording_consent_version')
            .eq('session_id', sessionId)
            .eq('user_id', rpUserId)
            .maybeSingle();

          const hasValidConsent =
            rpPart?.recording_consent_at &&
            rpPart?.recording_consent_version === currentVersion;

          if (!hasValidConsent) {
            const { data: rpProfile } = await db
              .from('profiles')
              .select('email')
              .eq('id', rpUserId)
              .maybeSingle();
            if (rpProfile?.email && isAdminEmail(rpProfile.email)) continue;

            try {
              await removeParticipant(session.room_name, rp.identity);
              removedIdentities.add(rp.identity);
              await auditHtgRecording(db, null, null, 'removed_no_consent', {
                user_id: rpUserId,
                reason: 'room_side_consent_check_at_start',
              });
            } catch (e) {
              console.error('[control/start] removeParticipant failed:', rp.identity, e);
            }
          }
        }

        // 8. Per-track egresses — two-phase commit, observer filter, UUID regex, 23505 race.
        for (const p of roomParticipants) {
          if (removedIdentities.has(p.identity)) continue;
          if (p.identity.startsWith('__obs__')) continue;

          const firstColon = p.identity.indexOf(':');
          const userId = firstColon > 0 ? p.identity.slice(0, firstColon) : p.identity;
          if (!UUID_RE.test(userId)) {
            console.warn('[control/start] skipping non-UUID identity:', p.identity);
            continue;
          }

          const { data: participantRow } = await db
            .from('htg_meeting_participants')
            .select('user_id, recording_consent_at, recording_consent_version')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .eq('status', 'joined')
            .maybeSingle();

          if (!participantRow) {
            await auditHtgRecording(db, null, null, 'egress_skipped_not_participant', {
              user_id: userId,
            });
            continue;
          }

          const hasConsent =
            participantRow.recording_consent_at &&
            participantRow.recording_consent_version === currentVersion;
          if (!hasConsent) {
            await auditHtgRecording(db, null, null, 'consent_missing_at_track_start', {
              user_id: userId,
              has_timestamp: !!participantRow.recording_consent_at,
              version_mismatch: participantRow.recording_consent_version !== currentVersion,
            });
            continue;
          }

          const trackClientRequestId = crypto.randomUUID();
          await db.from('htg_meeting_pending_egresses').insert({
            client_request_id: trackClientRequestId,
            meeting_session_id: sessionId,
            egress_kind: 'track',
            participant_user_id: userId,
            participant_identity: p.identity,
          });

          let trackStartSucceeded = false;
          let trackEgressId: string | null = null;
          try {
            const egress = await startParticipantEgress(session.room_name, p.identity);
            trackEgressId = egress.egressId;
            trackStartSucceeded = true;

            const { error: insertError } = await db.from('htg_meeting_egresses').insert({
              meeting_session_id: sessionId,
              egress_id: trackEgressId,
              egress_kind: 'track',
              participant_user_id: userId,
              participant_identity: p.identity,
            });

            if (insertError?.code === '23505') {
              try {
                await stopEgress(trackEgressId);
              } catch (stopErr) {
                await auditHtgRecording(db, null, trackEgressId, 'ghost_egress_junction_failed', {
                  reason: 'track_race_lost_stop_failed',
                  user_id: userId,
                  error: String(stopErr),
                });
                throw stopErr;
              }
            } else if (insertError) {
              try {
                await stopEgress(trackEgressId);
              } catch (stopErr) {
                await auditHtgRecording(db, null, trackEgressId, 'ghost_egress_junction_failed', {
                  reason: 'track_insert_error_stop_failed',
                  user_id: userId,
                  error: String(stopErr),
                });
                throw stopErr;
              }
              throw insertError;
            }

            await db
              .from('htg_meeting_pending_egresses')
              .delete()
              .eq('client_request_id', trackClientRequestId);
          } catch (e) {
            if (!trackStartSucceeded) {
              await db
                .from('htg_meeting_pending_egresses')
                .delete()
                .eq('client_request_id', trackClientRequestId);
            }
            console.warn(`[control/start] track egress failed for ${p.identity}:`, e);
          }
        }

        return NextResponse.json({ ok: true, recording: true });
      } catch (startError) {
        console.error('[control/start] recording start failed:', startError);
        await releaseMeetingRecordingLock(sessionId);
        return NextResponse.json({
          ok: true,
          recording: false,
          error: String(startError),
        });
      }
    }

    case 'next_question': {
      if (!session.current_stage_id)
        return NextResponse.json({ error: 'No current stage' }, { status: 400 });

      const questions = await getQuestionsForStage(session.current_stage_id);
      const currentIdx = questions.findIndex((q) => q.id === session.current_question_id);
      const nextQuestion =
        currentIdx >= 0 && currentIdx + 1 < questions.length ? questions[currentIdx + 1] : null;

      if (!nextQuestion) {
        const stages = await getStages();
        const currentStageIdx = stages.findIndex((s) => s.id === session.current_stage_id);
        const nextStage =
          currentStageIdx >= 0 && currentStageIdx + 1 < stages.length
            ? stages[currentStageIdx + 1]
            : null;

        if (!nextStage) {
          await db
            .from('htg_meeting_sessions')
            .update({
              status: 'free_talk',
              current_stage_id: null,
              current_question_id: null,
              current_speaker_id: null,
            })
            .eq('id', sessionId);
          return NextResponse.json({ ok: true });
        }

        const nextStageQuestions = await getQuestionsForStage(nextStage.id);
        const firstQ = nextStageQuestions[0] ?? null;
        const participants = await getJoinedParticipants(true);
        const speaker = pickRandom(participants, session.current_speaker_id);

        await db
          .from('htg_meeting_sessions')
          .update({
            current_stage_id: nextStage.id,
            current_question_id: firstQ?.id ?? null,
            current_speaker_id: speaker,
          })
          .eq('id', sessionId);

        return NextResponse.json({ ok: true });
      }

      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);

      await db
        .from('htg_meeting_sessions')
        .update({
          current_question_id: nextQuestion.id,
          current_speaker_id: speaker,
        })
        .eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    case 'next_stage': {
      const stages = await getStages();
      const currentStageIdx = stages.findIndex((s) => s.id === session.current_stage_id);
      const nextStage =
        currentStageIdx >= 0 && currentStageIdx + 1 < stages.length
          ? stages[currentStageIdx + 1]
          : null;

      if (!nextStage) {
        await db
          .from('htg_meeting_sessions')
          .update({
            status: 'free_talk',
            current_stage_id: null,
            current_question_id: null,
            current_speaker_id: null,
          })
          .eq('id', sessionId);
        return NextResponse.json({ ok: true });
      }

      const questions = await getQuestionsForStage(nextStage.id);
      const firstQ = questions[0] ?? null;
      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);

      await db
        .from('htg_meeting_sessions')
        .update({
          current_stage_id: nextStage.id,
          current_question_id: firstQ?.id ?? null,
          current_speaker_id: speaker,
        })
        .eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    case 'free_talk': {
      const newStatus = session.status === 'free_talk' ? 'active' : 'free_talk';
      await db.from('htg_meeting_sessions').update({ status: newStatus }).eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'skip_speaker': {
      const participants = await getJoinedParticipants(true);
      const speaker = pickRandom(participants, session.current_speaker_id);
      await db
        .from('htg_meeting_sessions')
        .update({ current_speaker_id: speaker })
        .eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'mute_all': {
      const newMuted = !(session.all_muted ?? false);
      await db
        .from('htg_meeting_sessions')
        .update({ all_muted: newMuted })
        .eq('id', sessionId);
      return NextResponse.json({ ok: true });
    }

    case 'mute_participant': {
      const userId = (payload as { userId?: string } | undefined)?.userId;
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

      const { data: p } = await db
        .from('htg_meeting_participants')
        .select('is_muted')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!p) return NextResponse.json({ error: 'Participant not found' }, { status: 404 });

      await db
        .from('htg_meeting_participants')
        .update({ is_muted: !p.is_muted })
        .eq('session_id', sessionId)
        .eq('user_id', userId);

      return NextResponse.json({ ok: true });
    }

    case 'end': {
      // Stop all active egresses via junction. Fail-closed semantics:
      // ended_at only set on successful stopEgress, stop_error recorded on
      // failure so the Section 7 reaper (PR #6) can retry later.
      const { data: activeEgresses } = await db
        .from('htg_meeting_egresses')
        .select('id, egress_id, egress_kind')
        .eq('meeting_session_id', sessionId)
        .is('ended_at', null);

      await Promise.allSettled(
        (activeEgresses ?? []).map(async (e) => {
          try {
            await stopEgress(e.egress_id);
            // .is('ended_at', null) guard: don't overwrite a timestamp already
            // set by the webhook egress_ended handler (PR #5).
            await db
              .from('htg_meeting_egresses')
              .update({
                ended_at: new Date().toISOString(),
                stop_error: null,
              })
              .eq('id', e.id)
              .is('ended_at', null);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn('[control/end] stopEgress failed:', e.egress_id, errMsg);
            await db
              .from('htg_meeting_egresses')
              .update({ stop_error: errMsg })
              .eq('id', e.id)
              .is('ended_at', null);
            await auditHtgRecording(db, null, e.egress_id, 'egress_stop_failed', {
              error: errMsg,
            });
          }
        }),
      );

      await db
        .from('htg_meeting_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
