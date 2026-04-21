import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { pollTranscript } from '@/lib/speakers/fireflies';
import { writeActiveImport } from '@/lib/speakers/import-writer';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/speaker-imports/diarize-fireflies/poll
 *
 * Sprawdza czy Fireflies zakończyło przetwarzanie transkrypcji dla tej sesji.
 * Tytuł jobu: `htg-ff-${sessionId}` — deterministyczny, bez dodatkowego store.
 *
 * Zwraca:
 *   { status: 'pending', message } — jeszcze przetwarza
 *   { status: 'done', segmentsInserted, rawSpeakerCount } — gotowe, import zapisany
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
  const jobKey = `htg-ff-${sessionId}`;

  let segments: Awaited<ReturnType<typeof pollTranscript>>;
  try {
    segments = await pollTranscript(jobKey, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[diarize-fireflies/poll] poll error', { sessionId, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!segments) {
    return NextResponse.json({ status: 'pending', message: 'Jeszcze przetwarza…' });
  }

  // Segments gotowe — zapisz import.
  const db = createSupabaseServiceRole();

  const { data: tmpl, error: tmplErr } = await db
    .from('session_templates')
    .select('bunny_video_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }

  const rawSpeakerCount = new Set(segments.map((s) => s.speakerKey)).size;

  const write = await writeActiveImport({
    db,
    sessionTemplateId: sessionId,
    source: 'fireflies_diarize',
    sourceJobKey: jobKey,
    sourceRef: (tmpl?.bunny_video_id as string | null) ?? null,
    createdBy: auth.user.id,
    segments,
  });

  return NextResponse.json({
    status: 'done',
    segmentsInserted: write.segmentsInserted,
    rawSpeakerCount,
  });
}
