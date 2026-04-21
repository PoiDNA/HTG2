import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/segments/[segmentId]
 *
 * Edycja pojedynczego segmentu transkrypcji w aktywnym imporcie.
 * Body (wszystkie pola opcjonalne):
 *   - text: string | null          — korekta tekstu (trim + max 8000)
 *   - speakerKey: string           — przepnięcie segmentu na innego mówcę
 *                                    (speakerKey musi istnieć w aktywnym imporcie)
 */
type Params = { params: Promise<{ sessionId: string; segmentId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId, segmentId } = await params;

  let body: { text?: string | null; speakerKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasText = 'text' in body;
  const hasSpeakerKey = typeof body.speakerKey === 'string' && body.speakerKey.length > 0;

  if (!hasText && !hasSpeakerKey) {
    return NextResponse.json(
      { error: 'Brak pól do aktualizacji (text lub speakerKey)' },
      { status: 400 },
    );
  }

  const raw = body.text;
  const nextText: string | null =
    typeof raw === 'string' ? (raw.trim() === '' ? null : raw) : null;
  if (hasText && nextText !== null && nextText.length > 8000) {
    return NextResponse.json({ error: 'Tekst za długi (max 8000)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Weryfikujemy, że segment należy do tej sesji (defense-in-depth).
  const { data: seg, error: segErr } = await db
    .from('session_speaker_segments')
    .select('id, session_template_id, import_id')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });
  if (!seg || seg.session_template_id !== sessionId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (hasText) patch.text = nextText;

  if (hasSpeakerKey) {
    const newKey = body.speakerKey as string;
    // Waliduj, że speakerKey istnieje w tym samym imporcie (ten sam import_id).
    const { data: exists, error: existsErr } = await db
      .from('session_speaker_segments')
      .select('id')
      .eq('import_id', seg.import_id)
      .eq('speaker_key', newKey)
      .limit(1)
      .maybeSingle();
    if (existsErr) return NextResponse.json({ error: existsErr.message }, { status: 500 });
    if (!exists) {
      return NextResponse.json(
        { error: 'Nieznany speakerKey w tym imporcie' },
        { status: 400 },
      );
    }
    patch.speaker_key = newKey;
  }

  const { error: updErr } = await db
    .from('session_speaker_segments')
    .update(patch)
    .eq('id', segmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    text: hasText ? nextText : undefined,
    speakerKey: hasSpeakerKey ? body.speakerKey : undefined,
  });
}
