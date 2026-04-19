import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signMedia } from '@/lib/media-signing';

/**
 * GET /api/admin/fragments/sessions/[sessionId]/audio-url
 *
 * Zwraca podpisany URL do audio sesji dla admin/editor.
 *
 * UWAGA: session_templates nie mają backup_storage_path (to kolumna
 * booking_recordings). Dla sesji bibliotecznych źródła to:
 *   - bunny_video_id + bunny_library_id → Bunny Stream HLS
 *   - bunny_video_id (sam) → Private CDN direct
 *
 * TTL 15 min.
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_templates')
    .select('id, bunny_video_id, bunny_library_id, waveform_peaks_url, duration_minutes, media_version')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[admin/audio-url] session_templates query failed', { sessionId, error });
    return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const signed = signMedia(
    {
      bunny_video_id: data.bunny_video_id,
      bunny_library_id: data.bunny_library_id,
      backup_storage_path: null,
      media_version: (data.media_version as number | null) ?? 0,
    },
    900,
  );

  if (!signed) {
    return NextResponse.json(
      {
        error:
          'Sesja nie ma źródła audio — brak bunny_video_id. Wgraj nagranie do Bunny Stream i uzupełnij session_templates.bunny_video_id.',
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    url: signed.url,
    deliveryType: signed.deliveryType,
    mimeType: signed.mimeType,
    peaksUrl: (data.waveform_peaks_url as string | null) ?? null,
    durationSec: data.duration_minutes ? Number(data.duration_minutes) * 60 : null,
  });
}
