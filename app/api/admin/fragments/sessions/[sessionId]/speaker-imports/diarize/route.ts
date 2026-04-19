import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signMedia } from '@/lib/media-signing';
import { fetchAudio, diarizeAudio, DiarizeError } from '@/lib/speakers/diarize';
import { writeActiveImport } from '@/lib/speakers/import-writer';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/speaker-imports/diarize
 *
 * Ingest diarize (gpt-4o-transcribe-diarize) dla pojedynczej sesji
 * archiwalnej. Tworzy nowy aktywny import + segmenty i dezaktywuje
 * poprzedni zestaw. Synchroniczny — maxDuration=800.
 *
 * Body (opcjonalne): { language?: string, sourceJobKey?: string }.
 *
 * PR 5 — dla plików >25 MB zwraca 413; chunking przychodzi z PR 6.
 */

export const runtime = 'nodejs';
export const maxDuration = 800;

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const db = createSupabaseServiceRole();

  const body = (await req.json().catch(() => ({}))) as {
    language?: string;
    sourceJobKey?: string;
  };

  // 1. Fetch session + signed audio URL (direct only — HLS w PR 6).
  const { data: tmpl, error: tmplErr } = await db
    .from('session_templates')
    .select('id, bunny_video_id, bunny_library_id, duration_minutes')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    console.error('[diarize] template fetch failed', { sessionId, error: tmplErr });
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmpl) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const signed = signMedia(
    {
      bunny_video_id: tmpl.bunny_video_id,
      bunny_library_id: tmpl.bunny_library_id,
      backup_storage_path: null,
    },
    900,
  );
  if (!signed) {
    return NextResponse.json(
      { error: 'Brak źródła audio — uzupełnij bunny_video_id.' },
      { status: 422 },
    );
  }
  if (signed.deliveryType === 'hls') {
    return NextResponse.json(
      {
        error:
          'Sesja ma tylko źródło HLS — diarize w PR 5 wymaga direct (mp3/m4a/mp4). Chunking + HLS ingest → PR 6.',
      },
      { status: 422 },
    );
  }

  // 2. Fetch + diarize.
  const start = Date.now();
  try {
    const fetched = await fetchAudio(signed.url);
    console.info('[diarize] fetched', {
      sessionId,
      bytes: fetched.buffer.byteLength,
      contentType: fetched.contentType,
      firstBytesHex: fetched.firstBytesHex,
      bunnyVideoId: tmpl.bunny_video_id,
      deliveryType: signed.deliveryType,
      signedMime: signed.mimeType,
    });

    // Wybór ext/mime z priorytetem: signMedia → bunny_video_id path → URL
    const pathExt = (tmpl.bunny_video_id ?? '').toLowerCase().split('.').pop() ?? '';
    const explicitExt = ['m4a', 'mp4', 'mp3', 'm4v', 'wav', 'ogg', 'webm'].includes(pathExt)
      ? (pathExt === 'm4v' ? 'mp4' : pathExt)
      : null;
    const explicitMime = signed.mimeType;

    const result = await diarizeAudio({
      audioBuffer: fetched.buffer,
      sourceUrl: signed.url,
      language: body.language ?? 'pl',
      explicitMime,
      explicitExt,
    });

    // 3. Write import + segments.
    const write = await writeActiveImport({
      db,
      sessionTemplateId: sessionId,
      source: 'archival_diarize',
      sourceJobKey: body.sourceJobKey ?? null,
      sourceRef: tmpl.bunny_video_id ?? null,
      createdBy: auth.user.id,
      segments: result.segments,
    });

    const ms = Date.now() - start;
    return NextResponse.json({
      importId: write.importId,
      segmentsInserted: write.segmentsInserted,
      deactivatedPrevious: write.deactivatedPrevious,
      reusedExisting: write.reusedExisting,
      rawSpeakerCount: result.rawSpeakerCount,
      durationSec: result.durationSec,
      elapsedMs: ms,
    });
  } catch (e) {
    if (e instanceof DiarizeError) {
      const statusByCode: Record<DiarizeError['code'], number> = {
        audio_fetch_failed: 502,
        file_too_large: 413,
        openai_api_error: 502,
        openai_parse_error: 502,
        no_api_key: 500,
      };
      console.error('[diarize] failed', { sessionId, code: e.code, message: e.message });
      return NextResponse.json({ error: e.message, code: e.code }, { status: statusByCode[e.code] });
    }
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[diarize] unexpected', { sessionId, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
