import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signMedia } from '@/lib/media-signing';

/**
 * GET /api/admin/fragments/sessions/[sessionId]/audio-url
 *
 * Zwraca podpisany URL do audio sesji dla admin/editor.
 * Obsługuje wszystkie 3 ścieżki dystrybucji (signMedia):
 *   - backup_storage_path (HTG2 Pull Zone — direct audio)
 *   - bunny_video_id + bunny_library_id (Bunny Stream HLS)
 *   - bunny_video_id (Private CDN — direct audio)
 *
 * TTL 15 min.
 *
 * Response: {
 *   url: string,
 *   deliveryType: 'hls' | 'direct',
 *   mimeType: string | null,
 *   peaksUrl: string | null,
 *   durationSec: number | null
 * }
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_templates')
    .select('id, bunny_video_id, bunny_library_id, backup_storage_path, waveform_peaks_url, duration_minutes')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const signed = signMedia(
    {
      bunny_video_id: data.bunny_video_id,
      bunny_library_id: data.bunny_library_id,
      backup_storage_path: data.backup_storage_path,
    },
    900,
  );

  if (!signed) {
    return NextResponse.json(
      { error: 'Session has no media source (brak bunny_video_id i backup_storage_path)' },
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
