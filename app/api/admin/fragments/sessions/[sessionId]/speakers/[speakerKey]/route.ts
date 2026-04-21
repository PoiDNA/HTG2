import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/speakers/[speakerKey]
 *
 * Nadanie / zmiana display_name dla mówcy w obrębie aktywnego importu.
 * Aktualizuje wszystkie segmenty o podanym speaker_key — również warianty
 * z prefiksem chunka (c0_A, c1_A, ...), które backfill dodaje, żeby
 * chunki nie dublowały etykiet.
 *
 * Body: { displayName: string | null }
 *   - string (po trim) — ustawia nową nazwę
 *   - '' lub null — czyści (wraca do fallbacku A/B/C)
 */
type Params = { params: Promise<{ sessionId: string; speakerKey: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId, speakerKey } = await params;
  const decodedKey = decodeURIComponent(speakerKey);

  let body: { displayName?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.displayName;
  const nextName: string | null =
    typeof raw === 'string' ? (raw.trim() === '' ? null : raw.trim()) : null;
  if (nextName !== null && nextName.length > 120) {
    return NextResponse.json({ error: 'Nazwa za długa (max 120)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  const { data: imp, error: impErr } = await db
    .from('session_speaker_imports')
    .select('id')
    .eq('session_template_id', sessionId)
    .eq('is_active', true)
    .maybeSingle();
  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });
  if (!imp) return NextResponse.json({ error: 'No active import' }, { status: 404 });

  // Dopasuj sam decodedKey oraz warianty c{n}_<key> z chunk-matchingu.
  const { error: updErr, count } = await db
    .from('session_speaker_segments')
    .update({ display_name: nextName }, { count: 'exact' })
    .eq('import_id', imp.id)
    .or(`speaker_key.eq.${decodedKey},speaker_key.like.c%25_${decodedKey}`);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, displayName: nextName, updated: count ?? 0 });
}
