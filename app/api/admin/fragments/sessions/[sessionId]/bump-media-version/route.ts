import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/bump-media-version
 *
 * Inkrementuje `session_templates.media_version` — cache-busting Bunny CDN
 * po podmianie pliku pod tą samą ścieżką w Storage.
 *
 * Side effects:
 *   - zeruje `waveform_peaks_url` (peaks są dla starego audio)
 *   - dezaktywuje aktywny import transkrypcji (segmenty są dla starego audio)
 *
 * Integracja z Bunny Purge API przyjdzie osobno.
 */

export const runtime = 'nodejs';

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data: tmpl, error: tmplErr } = await db
    .from('session_templates')
    .select('id, media_version')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmpl) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const nextVersion = ((tmpl.media_version as number | null) ?? 0) + 1;

  const { error: updErr } = await db
    .from('session_templates')
    .update({ media_version: nextVersion, waveform_peaks_url: null })
    .eq('id', sessionId);

  if (updErr) {
    return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 500 });
  }

  // Dezaktywuj aktywny import transkrypcji — segmenty są dla starego audio.
  const { error: deactErr } = await db
    .from('session_speaker_imports')
    .update({ is_active: false, status: 'superseded' })
    .eq('session_template_id', sessionId)
    .eq('is_active', true);

  if (deactErr) {
    console.warn('[bump-media-version] deactivate import failed', {
      sessionId,
      error: deactErr.message,
    });
  }

  return NextResponse.json({
    sessionId,
    mediaVersion: nextVersion,
    waveformCleared: true,
    transcriptDeactivated: true,
  });
}
