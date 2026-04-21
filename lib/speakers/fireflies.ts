/**
 * Klient Fireflies.ai GraphQL + logika upload/poll transkrypcji.
 *
 * Skopiowane i zaadaptowane z scripts/backfill-fireflies.ts (bez zależności CLI).
 */

import type { DiarizeSegment } from './diarize';

const FF_API = 'https://api.fireflies.ai/graphql';

export const SPEAKER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function ffGql(
  query: string,
  variables: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(FF_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error(`Fireflies GQL: ${json.errors[0].message}`);
  return json.data ?? {};
}

export async function uploadAudio(
  url: string,
  title: string,
  apiKey: string,
): Promise<{ success: boolean; message: string }> {
  const data = await ffGql(
    `
    mutation UploadAudio($input: AudioUploadInput) {
      uploadAudio(input: $input) { success title message }
    }
  `,
    { input: { url, title, custom_language: 'pl' } },
    apiKey,
  );
  return data['uploadAudio'] as { success: boolean; message: string };
}

/**
 * Szuka transkrypcji po tytule w ostatnich 50 uploadach.
 * Zwraca null jeśli nie znaleziono lub sentences są puste (jeszcze przetwarza).
 */
export async function pollTranscript(
  title: string,
  apiKey: string,
): Promise<DiarizeSegment[] | null> {
  const data = await ffGql(
    `query { transcripts(limit: 50) { id title } }`,
    {},
    apiKey,
  );
  const list = (data['transcripts'] as Array<{ id: string; title: string }>) ?? [];
  const found = list.find((t) => t.title === title);
  if (!found) return null;

  const tData = await ffGql(
    `
    query Transcript($id: String!) {
      transcript(id: $id) {
        sentences { speaker_id start_time end_time text }
      }
    }
  `,
    { id: found.id },
    apiKey,
  );

  const sentences = (
    tData['transcript'] as {
      sentences: Array<{
        speaker_id: number;
        start_time: number;
        end_time: number;
        text: string;
      }>;
    } | null
  )?.sentences;

  if (!sentences || sentences.length === 0) return null;

  // Mapuj speaker_id → A, B, C… (sortuj po pierwszym wystąpieniu)
  const idToLetter = new Map<number, string>();
  for (const s of sentences) {
    if (!idToLetter.has(s.speaker_id)) {
      idToLetter.set(
        s.speaker_id,
        SPEAKER_LETTERS[idToLetter.size] ?? `spk${s.speaker_id}`,
      );
    }
  }

  return sentences.map((s) => ({
    startSec: s.start_time,
    endSec: s.end_time,
    speakerKey: idToLetter.get(s.speaker_id) ?? 'A',
    text: s.text,
    confidence: null,
  }));
}
