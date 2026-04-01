import { NextRequest, NextResponse } from 'next/server';
import { getWebhookReceiver } from '@/lib/live/livekit';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const RECORDING_TYPES = ['natalia_solo', 'natalia_asysta', 'natalia_para'];

/**
 * Extract R2 object key from a full R2 URL.
 * R2 URL format: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
 * We store only the key (e.g. 'live_sessions/abc.mp4') in source_url.
 */
function extractR2ObjectKey(fileUrl: string): string | null {
  if (!fileUrl) return null;
  try {
    const u = new URL(fileUrl);
    // Pathname: /<bucket>/<key> or just /<key>
    let path = u.pathname.replace(/^\//, '');
    const bucketName = process.env.R2_BUCKET_NAME;
    if (bucketName && path.startsWith(bucketName + '/')) {
      path = path.slice(bucketName.length + 1);
    }
    return path || null;
  } catch {
    // Not a URL — might already be a key
    return fileUrl || null;
  }
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
      // LiveKit not configured — log and acknowledge silently
      console.warn('[webhook] LiveKit webhook secret missing — skipping signature verification');
      return NextResponse.json({ ok: true });
    }

    const event = await receiver.receive(body, authHeader);

    // ── 1. egress_ended → live_sessions URL update ────────────────────────
    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const supabase = createSupabaseServiceRole();

      // Composite recordings (wstep / sesja / podsumowanie)
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
        // NOTE: do NOT return here — we still need to handle booking_recordings below
      }

      // ── 2. Individual track recordings — via atomic RPC ─────────────────
      const fileUrl = egress.fileResults?.[0]?.location ?? null;

      if (fileUrl && !session) {
        // Only run track recording logic if this is NOT a composite recording
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('complete_session_track_egress', {
            p_egress_id: egressId,
            p_file_url:  fileUrl,
          });

        if (rpcError) {
          console.error('[webhook] complete_session_track_egress RPC error:', rpcError.message);
        } else {
          const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

          if (row?.all_tracks_done && row?.session_id) {
            const { data: existingPub } = await supabase
              .from('session_publications')
              .select('id')
              .eq('live_session_id', row.session_id)
              .maybeSingle();

            if (!existingPub) {
              const { data: fullSession } = await supabase
                .from('live_sessions')
                .select('id, room_name, created_at, recording_sesja_tracks, recording_sesja_url')
                .eq('id', row.session_id)
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
                    title:                `Sesja ${sessionDate} — ${fullSession.room_name ?? row.session_id.slice(0, 8)}`,
                    live_session_id:      row.session_id,
                    status:               'raw',
                    source_tracks:        sourceTracks,
                    source_composite_url: fullSession.recording_sesja_url ?? null,
                    created_at:           new Date().toISOString(),
                    updated_at:           new Date().toISOString(),
                  });

                if (insertError && !insertError.code?.includes('23505')) {
                  console.error('[webhook] auto-create publication error:', insertError.message);
                } else if (!insertError) {
                  console.log(`[webhook] Auto-created session_publication for live session ${row.session_id}`);
                }
              }
            }
          }
        }
      }
    }

    // ── 3. egress_started → booking_recordings INSERT ────────────────────
    // Creates the record immediately when recording starts (duration_seconds = NULL)
    // Cron skips records with duration_seconds IS NULL until egress_ended updates them.
    if (event.event === 'egress_started' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const db = createSupabaseServiceRole();

      // Find the live session via egress_sesja_id (set by consent endpoint)
      const { data: recSession } = await db
        .from('live_sessions')
        .select('id, booking_id, sesja_started_at, booking:bookings(session_type, user_id), slot:booking_slots(slot_date)')
        .eq('egress_sesja_id', egressId)
        .maybeSingle();

      if (recSession?.booking_id) {
        const sessionType = (recSession.booking as unknown as Record<string, unknown>)?.session_type as string | undefined;

        if (sessionType && RECORDING_TYPES.includes(sessionType)) {
          const slotDate = (recSession.slot as unknown as Record<string, unknown>)?.slot_date as string | undefined;
          const fileUrl = egress.fileResults?.[0]?.location ?? null;
          const sourceKey = fileUrl ? extractR2ObjectKey(fileUrl) : null;
          const retentionDays = 365; // TODO: read from site_settings

          const { data: newRec, error: insertErr } = await db
            .from('booking_recordings')
            .insert({
              booking_id: recSession.booking_id,
              live_session_id: recSession.id,
              egress_id: egressId,
              session_type: sessionType,
              session_date: slotDate ?? null,
              recording_started_at: recSession.sesja_started_at ?? new Date().toISOString(),
              source: 'live',
              status: 'queued',
              source_url: sourceKey,      // R2 object key (not a presigned URL)
              duration_seconds: null,     // Unknown until egress_ended — cron will wait
              title: `Sesja — ${slotDate ?? new Date().toISOString().slice(0, 10)}`,
              expires_at: slotDate
                ? new Date(new Date(slotDate).getTime() + retentionDays * 86400000).toISOString()
                : new Date(Date.now() + retentionDays * 86400000).toISOString(),
            })
            .select('id')
            .single();

          if (insertErr && insertErr.code !== '23505') {
            console.error('[webhook] booking_recordings insert (egress_started) error:', insertErr.message);
          } else if (!insertErr && newRec) {
            console.log(`[webhook] Created booking recording ${newRec.id} for egress_started ${egressId}`);
            await auditRecording(db, newRec.id, 'recording_created', {
              booking_id: recSession.booking_id,
              egress_id: egressId,
            });
          }
        }
      }
    }

    // ── 4. egress_ended → booking_recordings UPDATE duration_seconds ──────
    // Updates the record created by egress_started with final duration and source key.
    // If egress_started record is missing (webhook lost), creates a 'failed' record
    // flagged for manual admin review.
    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const db = createSupabaseServiceRole();

      // Find the live session (sesja composite only)
      const { data: recSession } = await db
        .from('live_sessions')
        .select('id, booking_id, sesja_started_at, booking:bookings(session_type), slot:booking_slots(slot_date)')
        .eq('egress_sesja_id', egressId)
        .maybeSingle();

      if (!recSession?.booking_id) {
        // This egress is not a booking recording sesja — skip
        return NextResponse.json({ ok: true });
      }

      const sessionType = (recSession.booking as Record<string, unknown>)?.session_type as string | undefined;
      if (!sessionType || !RECORDING_TYPES.includes(sessionType)) {
        return NextResponse.json({ ok: true });
      }

      const fileUrl = egress.fileResults?.[0]?.location ?? null;
      const sourceKey = fileUrl ? extractR2ObjectKey(fileUrl) : null;

      // Compute duration from LiveKit timestamps
      // startedAt / endedAt are typically Unix ms in JS SDK
      let durationSeconds: number | null = null;
      if (egress.endedAt && egress.startedAt) {
        const startMs = typeof egress.startedAt === 'bigint'
          ? Number(egress.startedAt) / 1_000_000
          : Number(egress.startedAt);
        const endMs = typeof egress.endedAt === 'bigint'
          ? Number(egress.endedAt) / 1_000_000
          : Number(egress.endedAt);
        const diff = endMs - startMs;
        // Sanity check: if diff looks like nanoseconds (> 1e12), convert
        durationSeconds = diff > 1e12 ? Math.round(diff / 1_000_000_000) : Math.round(diff / 1000);
        if (durationSeconds <= 0) durationSeconds = null;
      }

      // Check if record exists (from egress_started)
      const { data: existing } = await db
        .from('booking_recordings')
        .select('id')
        .eq('egress_id', egressId)
        .maybeSingle();

      if (existing) {
        // Normal flow: update duration + final source key
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (durationSeconds != null) updates.duration_seconds = durationSeconds;
        if (sourceKey) updates.source_url = sourceKey;

        await db.from('booking_recordings').update(updates).eq('id', existing.id);
        console.log(`[webhook] Updated booking recording ${existing.id} with duration=${durationSeconds}s`);
      } else {
        // egress_started webhook was lost — create record flagged for manual review
        const slotDate = (recSession.slot as Record<string, unknown>)?.slot_date as string | undefined;
        const retentionDays = 365;

        const { data: newRec, error: insertErr } = await db
          .from('booking_recordings')
          .insert({
            booking_id: recSession.booking_id,
            live_session_id: recSession.id,
            egress_id: egressId,
            session_type: sessionType,
            session_date: slotDate ?? null,
            recording_started_at: recSession.sesja_started_at ?? null,
            source: 'live',
            status: 'failed',
            source_url: sourceKey,
            duration_seconds: durationSeconds,
            last_error: 'egress_started_webhook_missing',
            title: `Sesja — ${slotDate ?? new Date().toISOString().slice(0, 10)}`,
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
          console.warn(`[webhook] egress_started missing — created failed record ${newRec.id} for egress ${egressId}`);
          await auditRecording(db, newRec.id, 'retry', {
            reason: 'egress_started_missing',
            egress_id: egressId,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
