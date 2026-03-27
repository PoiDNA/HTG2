import { NextRequest, NextResponse } from 'next/server';
import { getWebhookReceiver } from '@/lib/live/livekit';
import { createClient } from '@supabase/supabase-js';

// Use service role client for webhooks (no user context)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for webhook handler');
  }
  return createClient(url, serviceKey);
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

    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;
      const supabase = getServiceClient();

      // ── 1. Composite recordings (wstep / sesja / podsumowanie) ──────────
      // Single query with OR instead of 3 sequential round-trips
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
          // Determine which column matched
          const urlColumn =
            session.egress_wstep_id       === egressId ? 'recording_wstep_url' :
            session.egress_sesja_id       === egressId ? 'recording_sesja_url' :
                                                         'recording_podsumowanie_url';

          await supabase
            .from('live_sessions')
            .update({ [urlColumn]: fileUrl })
            .eq('id', session.id);
        }
        return NextResponse.json({ ok: true });
      }

      // ── 2. Individual track recordings — via atomic RPC ─────────────────
      // The RPC performs: find session (with row lock) + merge JSONB atomically.
      // This eliminates the race condition that occurred when multiple webhooks
      // arrived simultaneously and overwrote each other's writes.
      const fileUrl = egress.fileResults?.[0]?.location ?? null;

      if (fileUrl) {
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('complete_session_track_egress', {
            p_egress_id: egressId,
            p_file_url:  fileUrl,
          });

        if (rpcError) {
          console.error('[webhook] complete_session_track_egress RPC error:', rpcError.message);
          return NextResponse.json({ error: rpcError.message }, { status: 500 });
        }

        const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

        if (row?.all_tracks_done && row?.session_id) {
          // All individual tracks are now recorded — auto-create session_publication
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

              if (insertError) {
                // UNIQUE violation = publication already exists (concurrent webhook) — safe to ignore
                if (!insertError.code?.includes('23505')) {
                  console.error('[webhook] auto-create publication error:', insertError.message);
                }
              } else {
                console.log(`[webhook] Auto-created session_publication for live session ${row.session_id}`);
              }
            }
          }
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
