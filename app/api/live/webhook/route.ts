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
      // LiveKit not configured — acknowledge webhook silently
      return NextResponse.json({ ok: true });
    }

    const event = await receiver.receive(body, authHeader);

    // Handle egress completion events
    if (event.event === 'egress_ended' && event.egressInfo) {
      const egress = event.egressInfo;
      const egressId = egress.egressId;

      // Find which session this egress belongs to
      const supabase = getServiceClient();

      // Try matching against each egress ID column
      const columns = [
        { column: 'egress_wstep_id', urlColumn: 'recording_wstep_url' },
        { column: 'egress_sesja_id', urlColumn: 'recording_sesja_url' },
        { column: 'egress_podsumowanie_id', urlColumn: 'recording_podsumowanie_url' },
      ];

      for (const { column, urlColumn } of columns) {
        const { data: session } = await supabase
          .from('live_sessions')
          .select('id')
          .eq(column, egressId)
          .single();

        if (session) {
          // Extract file URL from egress results
          const fileResults = egress.fileResults;
          const url = fileResults?.[0]?.location ?? null;

          if (url) {
            await supabase
              .from('live_sessions')
              .update({ [urlColumn]: url })
              .eq('id', session.id);
          }
          break;
        }
      }

      // Also check track egresses in the JSONB column
      const { data: sessions } = await supabase
        .from('live_sessions')
        .select('id, egress_sesja_tracks_ids, recording_sesja_tracks')
        .not('egress_sesja_tracks_ids', 'is', null);

      if (sessions) {
        for (const session of sessions) {
          const trackIds = session.egress_sesja_tracks_ids as Record<string, string>;
          for (const [participantId, trackEgressId] of Object.entries(trackIds)) {
            if (trackEgressId === egressId) {
              const fileUrl = egress.fileResults?.[0]?.location ?? null;
              if (fileUrl) {
                const existingTracks = (session.recording_sesja_tracks as Record<string, string>) ?? {};
                existingTracks[participantId] = fileUrl;

                await supabase
                  .from('live_sessions')
                  .update({ recording_sesja_tracks: existingTracks })
                  .eq('id', session.id);
              }
              break;
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
