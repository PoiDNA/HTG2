import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signBunnyUrl } from '@/lib/bunny';

/**
 * GET /api/admin/fragments/sessions/[sessionId]/audio-url
 *
 * Zwraca podpisany URL HLS (Bunny Stream) dla admina/edytora do
 * odsłuchu w narzędziu segmentacji Momentów. TTL 15 min —
 * wystarczy na pojedynczą sesję edycji.
 *
 * Response: { url: string, peaksUrl: string | null, durationSec: number | null }
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_templates')
    .select('id, bunny_video_id, bunny_library_id, waveform_peaks_url, duration_minutes')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (!data.bunny_video_id || !data.bunny_library_id) {
    return NextResponse.json(
      { error: 'Session has no Bunny Stream source (bunny_video_id/bunny_library_id missing)' },
      { status: 422 },
    );
  }

  const url = signBunnyUrl(data.bunny_video_id, data.bunny_library_id, 900);

  return NextResponse.json({
    url,
    peaksUrl: (data.waveform_peaks_url as string | null) ?? null,
    durationSec: data.duration_minutes ? Number(data.duration_minutes) * 60 : null,
  });
}
