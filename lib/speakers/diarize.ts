/**
 * Diarize mixed-audio sesji przez OpenAI gpt-4o-transcribe-diarize.
 *
 * Pipeline:
 *   1. Pobiera audio z podpisanego URL (Bunny / HTG2 Storage / Private CDN).
 *   2. Weryfikuje rozmiar (OpenAI audio endpoint ma 25 MB limit synchroniczny).
 *   3. POST multipart do /v1/audio/transcriptions z model=gpt-4o-transcribe-diarize
 *      i response_format=diarized_json.
 *   4. Normalizuje odpowiedź do shape SpeakerSegment z kontraktu 094.
 *
 * Czego NIE robi:
 *   - chunking plików >25 MB — to zakres PR 6 (backfill biblioteczny)
 *   - mapowania diarizacyjnych `spk_N` do stabilnych ról host/client —
 *     to kolejny krok; na start wszystkie segmenty dostają role=null
 *     i display_name=null, edytor ręcznie przypisze.
 */

export const DIARIZE_MODEL = 'gpt-4o-transcribe-diarize';
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

export class DiarizeError extends Error {
  constructor(
    public code:
      | 'audio_fetch_failed'
      | 'file_too_large'
      | 'openai_api_error'
      | 'openai_parse_error'
      | 'no_api_key',
    message: string,
  ) {
    super(message);
    this.name = 'DiarizeError';
  }
}

export interface DiarizeSegment {
  startSec: number;
  endSec: number;
  speakerKey: string;
  text: string;
  confidence: number | null;
}

export interface DiarizeResult {
  segments: DiarizeSegment[];
  durationSec: number;
  language: string | null;
  rawSpeakerCount: number;
}

function mimeFromUrl(url: string): { mime: string; ext: string } {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.m3u8')) return { mime: 'application/vnd.apple.mpegurl', ext: 'm3u8' };
  if (lower.endsWith('.mp3')) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (lower.endsWith('.m4a')) return { mime: 'audio/mp4', ext: 'm4a' };
  if (lower.endsWith('.mp4')) return { mime: 'audio/mp4', ext: 'mp4' };
  if (lower.endsWith('.ogg')) return { mime: 'audio/ogg', ext: 'ogg' };
  if (lower.endsWith('.wav')) return { mime: 'audio/wav', ext: 'wav' };
  if (lower.endsWith('.webm')) return { mime: 'audio/webm', ext: 'webm' };
  return { mime: 'application/octet-stream', ext: 'mp3' };
}

/**
 * Pobiera audio z signed URL i zwraca ArrayBuffer.
 * HLS (m3u8) wymaga preprocessingu — ten helper odrzuca m3u8 jawnie,
 * PR 6 dla backfillu doda ścieżkę HLS → single MP3.
 */
export async function fetchAudio(url: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string | null;
  firstBytesHex: string;
}> {
  const { ext } = mimeFromUrl(url);
  if (ext === 'm3u8') {
    throw new DiarizeError(
      'audio_fetch_failed',
      'HLS manifest nie jest obsługiwany w diarize (PR 5). Użyj źródła direct (mp3/m4a/mp4).',
    );
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new DiarizeError(
      'audio_fetch_failed',
      `HTTP ${res.status} przy pobieraniu audio`,
    );
  }
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type');
  const firstBytes = new Uint8Array(buffer.slice(0, 16));
  const firstBytesHex = Array.from(firstBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { buffer, contentType, firstBytesHex };
}

/**
 * Wywołuje OpenAI gpt-4o-transcribe-diarize i zwraca znormalizowane segmenty.
 * Odpowiedź OpenAI (`response_format=diarized_json`) zawiera `segments[]`
 * z polami {start, end, speaker, text}. Jeśli shape odbiega, parser
 * zbiera co się da i rzuca openai_parse_error dla pustego wyniku.
 */
export async function diarizeAudio(params: {
  audioBuffer: ArrayBuffer;
  sourceUrl: string;
  language?: string | null;
  /** Override MIME (np. z signed.mimeType). Fallback: inferencja z URL. */
  explicitMime?: string | null;
  /** Override extension dla nazwy pliku uploadowanego do OpenAI. */
  explicitExt?: string | null;
}): Promise<DiarizeResult> {
  const { audioBuffer, sourceUrl, language, explicitMime, explicitExt } = params;

  if (audioBuffer.byteLength > MAX_FILE_SIZE) {
    throw new DiarizeError(
      'file_too_large',
      `${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB (OpenAI limit). Wymaga chunkingu (PR 6).`,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DiarizeError('no_api_key', 'OPENAI_API_KEY nie jest skonfigurowany');
  }

  const inferred = mimeFromUrl(sourceUrl);
  const mime = explicitMime ?? inferred.mime;
  const ext = explicitExt ?? inferred.ext;
  const blob = new Blob([audioBuffer], { type: mime });
  const fd = new FormData();
  fd.append('file', blob, `session.${ext}`);
  fd.append('model', DIARIZE_MODEL);
  fd.append('response_format', 'diarized_json');
  if (language) fd.append('language', language);
  console.info('[diarize] upload', {
    bytes: audioBuffer.byteLength,
    mime,
    ext,
    filename: `session.${ext}`,
  });

  let res: Response;
  try {
    res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
  } catch (e) {
    throw new DiarizeError(
      'openai_api_error',
      `network: ${(e as Error)?.message ?? 'unknown'}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[diarize] OpenAI non-ok', { status: res.status, body: body.slice(0, 500) });
    throw new DiarizeError(
      'openai_api_error',
      `status_${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
    );
  }

  const json = (await res.json().catch(() => null)) as {
    segments?: Array<{
      start?: number;
      end?: number;
      speaker?: string;
      text?: string;
      confidence?: number;
      avg_logprob?: number;
    }>;
    duration?: number;
    language?: string;
  } | null;

  if (!json || !Array.isArray(json.segments) || json.segments.length === 0) {
    throw new DiarizeError('openai_parse_error', 'brak segments[] w odpowiedzi diarize');
  }

  const speakerKeys = new Set<string>();
  const segments: DiarizeSegment[] = [];
  for (const s of json.segments) {
    const startSec = typeof s.start === 'number' ? s.start : null;
    const endSec = typeof s.end === 'number' ? s.end : null;
    const speakerKey = typeof s.speaker === 'string' && s.speaker ? s.speaker : null;
    const text = typeof s.text === 'string' ? s.text.trim() : '';
    if (startSec === null || endSec === null || endSec <= startSec) continue;
    if (!speakerKey) continue;

    speakerKeys.add(speakerKey);
    const confidence =
      typeof s.confidence === 'number' ? clamp01(s.confidence)
      : typeof s.avg_logprob === 'number' ? clamp01(Math.exp(s.avg_logprob))
      : null;

    segments.push({
      startSec,
      endSec,
      speakerKey,
      text,
      confidence,
    });
  }

  if (segments.length === 0) {
    throw new DiarizeError('openai_parse_error', 'wszystkie segmenty zostały odfiltrowane');
  }

  return {
    segments,
    durationSec: json.duration ?? segments[segments.length - 1].endSec,
    language: json.language ?? language ?? null,
    rawSpeakerCount: speakerKeys.size,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
