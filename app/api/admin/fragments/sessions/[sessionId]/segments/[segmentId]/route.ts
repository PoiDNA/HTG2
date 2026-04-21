import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/segments/[segmentId]
 *
 * Edycja tekstu pojedynczego segmentu transkrypcji w aktywnym imporcie.
 * Body: { text: string | null }
 */
type Params = { params: Promise<{ sessionId: string; segmentId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId, segmentId } = await params;

  let body: { text?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.text;
  const nextText: string | null =
    typeof raw === 'string' ? (raw.trim() === '' ? null : raw) : null;
  if (nextText !== null && nextText.length > 8000) {
    return NextResponse.json({ error: 'Tekst za długi (max 8000)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Weryfikujemy, że segment należy do tej sesji (defense-in-depth).
  const { data: seg, error: segErr } = await db
    .from('session_speaker_segments')
    .select('id, session_template_id')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });
  if (!seg || seg.session_template_id !== sessionId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  const { error: updErr } = await db
    .from('session_speaker_segments')
    .update({ text: nextText })
    .eq('id', segmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, text: nextText });
}
