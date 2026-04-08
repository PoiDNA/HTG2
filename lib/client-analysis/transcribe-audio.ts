// Transcribe audio files via OpenAI Whisper API.
//
// Distinct from lib/auto-edit/transcribe.ts which requires WAV + chunking.
// This module:
// - accepts Opus/Ogg from LiveKit DirectFileOutput (or MP4 for forward compat)
// - does NOT parse WAV header (no parseWavHeader dependency)
// - does NOT chunk (audio-only 10min tracks are ~5-10 MB, well under 25 MB limit)
// - throws file_too_large for oversized buffers instead of trying to chunk

import { AnalysisError } from './errors';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // Whisper API hard limit

export interface TranscriptionResult {
  identity: string;
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
  duration: number;
}

/**
 * Derive content type from a file URL's extension.
 * LiveKit DirectFileOutput for Opus audio tracks produces .ogg files.
 * Fallback: application/octet-stream — Whisper will attempt detection.
 */
function contentTypeFromUrl(url: string): { mime: string; ext: string } {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.ogg') || lower.endsWith('.ogg.mp4')) return { mime: 'audio/ogg', ext: 'ogg' };
  if (lower.endsWith('.mp4') || lower.endsWith('.m4a')) return { mime: 'audio/mp4', ext: 'mp4' };
  if (lower.endsWith('.webm')) return { mime: 'audio/webm', ext: 'webm' };
  if (lower.endsWith('.mp3') || lower.endsWith('.mpga')) return { mime: 'audio/mp3', ext: 'mp3' };
  if (lower.endsWith('.wav')) return { mime: 'audio/wav', ext: 'wav' };
  return { mime: 'application/octet-stream', ext: 'ogg' };
}

export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  identity: string,
  fileUrl: string,
): Promise<TranscriptionResult> {
  // Size check first — fail fast before requiring API key
  if (audioBuffer.byteLength > MAX_FILE_SIZE) {
    throw new AnalysisError(
      'file_too_large',
      `${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB limit`,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AnalysisError('whisper_api_error', 'OPENAI_API_KEY not configured');
  }

  const { mime, ext } = contentTypeFromUrl(fileUrl);
  const blob = new Blob([audioBuffer], { type: mime });
  const formData = new FormData();
  formData.append('file', blob, `${identity}.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pl');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  let res: Response;
  try {
    res = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
  } catch (e) {
    throw new AnalysisError('whisper_api_error', `network: ${(e as Error)?.message}`);
  }

  if (!res.ok) {
    // Log status but don't leak response body to DB (may contain snippets).
    console.warn(`[client-analysis] Whisper API ${res.status} for ${identity}`);
    throw new AnalysisError('whisper_api_error', `status_${res.status}`);
  }

  const json = (await res.json()) as {
    text?: string;
    duration?: number;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  return {
    identity,
    text: json.text ?? '',
    words: (json.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
    duration: json.duration ?? 0,
  };
}
