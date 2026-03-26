// ============================================================
// Transcription stage — OpenAI Whisper API
// ============================================================

import type { TranscriptionResult, TranscriptionWord } from './types';
import { splitWavIntoChunks, parseWavHeader } from './wav-utils';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB Whisper limit
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperResponse {
  text: string;
  language: string;
  duration: number;
  words?: WhisperWord[];
}

/**
 * Transcribe a single audio buffer via Whisper API.
 * Returns verbose JSON with word-level timestamps.
 */
async function callWhisper(audioBuffer: ArrayBuffer, filename: string): Promise<WhisperResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const blob = new Blob([audioBuffer], { type: 'audio/wav' });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pl');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * Transcribe a single WAV track. Handles chunking for large files.
 */
export async function transcribeTrack(
  audioBuffer: ArrayBuffer,
  trackName: string,
  trackUrl: string
): Promise<TranscriptionResult> {
  const header = parseWavHeader(audioBuffer);

  // If file is small enough, transcribe directly
  if (audioBuffer.byteLength <= MAX_FILE_SIZE) {
    const result = await callWhisper(audioBuffer, `${trackName}.wav`);
    return {
      trackName,
      trackUrl,
      text: result.text,
      words: (result.words || []).map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
      duration: header.duration,
      language: result.language || 'pl',
    };
  }

  // Large file — split into chunks and transcribe each
  console.log(`[auto-edit] Track "${trackName}" is ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, splitting into chunks`);

  const chunks = splitWavIntoChunks(audioBuffer, CHUNK_DURATION_SECONDS);
  const allWords: TranscriptionWord[] = [];
  const textParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[auto-edit] Transcribing chunk ${i + 1}/${chunks.length} (${chunk.startTime.toFixed(0)}s - ${chunk.endTime.toFixed(0)}s)`);

    const result = await callWhisper(chunk.buffer, `${trackName}_chunk${i}.wav`);
    textParts.push(result.text);

    // Offset word timestamps by the chunk's start time
    const chunkWords = (result.words || []).map((w) => ({
      word: w.word,
      start: w.start + chunk.startTime,
      end: w.end + chunk.startTime,
    }));
    allWords.push(...chunkWords);
  }

  return {
    trackName,
    trackUrl,
    text: textParts.join(' '),
    words: allWords,
    duration: header.duration,
    language: 'pl',
  };
}

/**
 * Transcribe all source tracks in a session.
 */
export async function transcribeAllTracks(
  tracks: { name: string; url: string }[],
  downloadFn: (url: string) => Promise<ArrayBuffer>
): Promise<TranscriptionResult[]> {
  const results: TranscriptionResult[] = [];

  for (const track of tracks) {
    console.log(`[auto-edit] Downloading track "${track.name}" for transcription...`);
    const buffer = await downloadFn(track.url);
    console.log(`[auto-edit] Transcribing track "${track.name}" (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)...`);
    const result = await transcribeTrack(buffer, track.name, track.url);
    results.push(result);
    console.log(`[auto-edit] Transcription complete for "${track.name}": ${result.words.length} words, ${result.duration.toFixed(0)}s`);
  }

  return results;
}
