import { NextRequest, NextResponse } from 'next/server';
import { getWebhookReceiver } from '@/lib/live/livekit';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { extractR2ObjectKey } from '@/lib/r2-presigned';

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
                expires_at: slotDate
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
          expires_at: slotDate
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
