import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PUT /api/admin/fragments/sessions/[sessionId]/waveform
 * Store pre-computed waveform peaks URL for a session template.
 * Called by background job after Bunny Stream encoding completes.
 *
 * Body: { peaks_url: string }  — URL to the peaks JSON file (e.g. Bunny Storage)
 *
 * GET /api/admin/fragments/sessions/[sessionId]/waveform
 * Return current waveform_peaks_url (null if not yet available).
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_templates')
    .select('id, title, waveform_peaks_url')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    session_id: data.id,
    title: data.title,
    waveform_peaks_url: data.waveform_peaks_url ?? null,
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const body = await request.json().catch(() => null);

  if (!body?.peaks_url || typeof body.peaks_url !== 'string') {
    return NextResponse.json({ error: 'peaks_url is required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();
  const { error } = await db
    .from('session_templates')
    .update({ waveform_peaks_url: body.peaks_url })
    .eq('id', sessionId);

  if (error) {
    console.error('[admin/waveform] PUT failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, session_id: sessionId, peaks_url: body.peaks_url });
}
