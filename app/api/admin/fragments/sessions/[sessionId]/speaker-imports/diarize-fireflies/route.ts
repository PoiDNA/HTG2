import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signMedia } from '@/lib/media-signing';
import { uploadAudio } from '@/lib/speakers/fireflies';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/speaker-imports/diarize-fireflies
 *
 * Wysyła plik audio sesji do Fireflies.ai do asynchronicznego przetwarzania.
 * Tytuł jobu: `htg-ff-${sessionId}` — deterministyczny, żeby poll mógł
 * go odtworzyć bez dodatkowego store.
 *
 * Zwraca: { ok: true, jobKey, message }
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Brak FIREFLIES_API_KEY — skontaktuj się z administratorem.' },
      { status: 500 },
    );
  }

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const { data: tmpl, error: tmplErr } = await db
    .from('session_templates')
    .select('id, bunny_video_id, bunny_library_id, media_version')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmpl) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Signed URL na 3h — Fireflies potrzebuje czasu na pobranie pliku.
  const signed = signMedia(
    {
      bunny_video_id: tmpl.bunny_video_id,
      bunny_library_id: tmpl.bunny_library_id,
      backup_storage_path: null,
      media_version: (tmpl.media_version as number | null) ?? 0,
    },
    10800,
  );

  if (!signed) {
    return NextResponse.json(
      { error: 'Brak źródła audio — uzupełnij bunny_video_id.' },
      { status: 422 },
    );
  }
  if (signed.deliveryType !== 'direct') {
    return NextResponse.json(
      { error: 'Sesja nie ma direct audio (mp3/m4a/m4v) — Fireflies wymaga bezpośredniego pliku.' },
      { status: 422 },
    );
  }

  const jobKey = `htg-ff-${sessionId}`;

  try {
    const upload = await uploadAudio(signed.url, jobKey, apiKey);
    if (!upload.success) {
      return NextResponse.json(
        { error: `Fireflies upload failed: ${upload.message}` },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[diarize-fireflies] upload error', { sessionId, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    jobKey,
    message: 'Przesłano do Fireflies. Przetwarzanie zajmuje 5-20 minut.',
  });
}
