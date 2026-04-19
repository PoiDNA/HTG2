/**
 * Łączenie wielochunkowych wyników diarize w spójną listę segmentów
 * z kanonicznymi kluczami mówców (A, B, C…) konsekwentnymi między chunkami.
 *
 * Problem: gpt-4o-transcribe-diarize przypisuje etykiety (spk_0, spk_1…)
 * niezależnie per chunk — "A" z chunka 0 może być odwrotnością "A" z chunka 1.
 *
 * Rozwiązanie: nakładające się chunki (overlap).
 * - Każdy chunk zawiera OVERLAP_SEC dodatkowego audio na każdym końcu.
 * - W strefie nakładania oba sąsiednie chunki mają transkrypcję tego samego audio.
 * - Dopasowanie: liczymy czas mówienia per głos w strefie i dopasowujemy
 *   dominant→dominant, second→second (duration-based alignment).
 *
 * Schemat czasu:
 *   Chunk 0: absolute [0,          CHUNK+OVL],    offsetSec = 0
 *   Chunk 1: absolute [CHUNK-OVL,  2·CHUNK+OVL],  offsetSec = CHUNK-OVL
 *   Chunk i: absolute [i·CHUNK-OVL, (i+1)·CHUNK+OVL], offsetSec = max(0, i·CHUNK-OVL)
 *
 * Strefa nakładania między chunk i a i+1:
 *   absolute [(i+1)·CHUNK - OVL, (i+1)·CHUNK + OVL]
 *   = 2·OVL sekund, tyle samo w każdym chunku
 *
 * Output: posortowane segmenty bez duplikatów z kluczami A/B/C/…
 */

import type { DiarizeSegment } from './diarize';

export interface ChunkResult {
  segments: DiarizeSegment[];
  /** Absolutny czas startu chunka w oryginalnym nagraniu. */
  offsetSec: number;
  idx: number;
}

const SPEAKER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function nextAvailableLetter(used: Set<string>): string {
  for (const l of SPEAKER_LETTERS) {
    if (!used.has(l)) return l;
  }
  return `spk${used.size}`;
}

/**
 * Liczy sumę czasu mówienia per głos w oknie [windowStart, windowEnd] (relative).
 */
function durationInWindow(
  segments: DiarizeSegment[],
  windowStart: number,
  windowEnd: number,
): Map<string, number> {
  const dur = new Map<string, number>();
  for (const s of segments) {
    if (s.endSec <= windowStart || s.startSec >= windowEnd) continue;
    const start = Math.max(s.startSec, windowStart);
    const end = Math.min(s.endSec, windowEnd);
    dur.set(s.speakerKey, (dur.get(s.speakerKey) ?? 0) + end - start);
  }
  return dur;
}

/**
 * Buduje mapowanie lokalnych kluczy chunka i+1 → kanoniczne klucze (z chunka i).
 *
 * chunkSec   — nominalna długość każdego chunka (bez overlap)
 * overlapSec — ile sekund overlap po każdej stronie granicy
 */
function buildMapping(
  prevChunk: ChunkResult,
  currChunk: ChunkResult,
  prevMapping: Map<string, string>,
  chunkSec: number,
  overlapSec: number,
): Map<string, string> {
  // Granica między chunkami w absolutnym czasie.
  const boundaryAbs = currChunk.offsetSec + overlapSec;
  // Strefa nakładania: [boundary-OVL, boundary+OVL] (absolute)
  //   → w prevChunk relative: [boundary-OVL - prevChunk.offsetSec, boundary+OVL - prevChunk.offsetSec]
  //   → w currChunk relative: [0, 2*OVL] (reset_timestamps=1)
  const prevWinStart = boundaryAbs - overlapSec - prevChunk.offsetSec;
  const prevWinEnd   = boundaryAbs + overlapSec - prevChunk.offsetSec;
  const currWinStart = 0;
  const currWinEnd   = overlapSec * 2;

  const prevDur = durationInWindow(prevChunk.segments, prevWinStart, prevWinEnd);
  const currDur = durationInWindow(currChunk.segments, currWinStart, currWinEnd);

  // Sortuj po czasie mówienia malejąco.
  const prevSorted = [...prevDur.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const currSorted = [...currDur.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

  const currMap = new Map<string, string>();
  const usedCanonical = new Set(prevMapping.values());

  // Mapuj positional: dominant prev ↔ dominant curr, second ↔ second, itd.
  for (let j = 0; j < currSorted.length; j++) {
    const currSpk = currSorted[j];
    if (j < prevSorted.length) {
      // Canonical tego głosu to canonical prevSorted[j]
      const canonical = prevMapping.get(prevSorted[j]) ?? nextAvailableLetter(usedCanonical);
      currMap.set(currSpk, canonical);
      usedCanonical.add(canonical);
    } else {
      // Nowy głos nie widziany w overlap — daj nową literę.
      const canonical = nextAvailableLetter(usedCanonical);
      currMap.set(currSpk, canonical);
      usedCanonical.add(canonical);
    }
  }

  // Głosy z curr poza strefą overlap (nie trafiły do currDur) — też mapuj.
  const usedInMap = new Set(currMap.values());
  for (const seg of currChunk.segments) {
    if (!currMap.has(seg.speakerKey)) {
      const canonical = nextAvailableLetter(usedInMap);
      currMap.set(seg.speakerKey, canonical);
      usedInMap.add(canonical);
    }
  }

  return currMap;
}

/**
 * Scala wyniki wielochunkowego diarize w spójną listę segmentów.
 *
 * @param chunks      — wyniki diarize per chunk z offsetami absolutnymi
 * @param chunkSec    — nominalna długość chunka (bez overlap), np. 1200
 * @param overlapSec  — overlap po każdej stronie granicy, np. 60
 */
export function mergeChunksWithSpeakerMatching(
  chunks: ChunkResult[],
  chunkSec: number,
  overlapSec: number,
): DiarizeSegment[] {
  if (chunks.length === 0) return [];

  // Chunk 0: assign canonical letters A, B, C…
  const chunk0Speakers = [...new Set(chunks[0].segments.map(s => s.speakerKey))];
  // Sortuj po pierwszym wystąpieniu żeby A = kto mówi pierwszy.
  chunk0Speakers.sort((a, b) => {
    const fa = chunks[0].segments.find(s => s.speakerKey === a)?.startSec ?? Infinity;
    const fb = chunks[0].segments.find(s => s.speakerKey === b)?.startSec ?? Infinity;
    return fa - fb;
  });
  const chunk0Map = new Map(
    chunk0Speakers.map((k, i) => [k, SPEAKER_LETTERS[i] ?? `spk${i}`]),
  );

  const mappings: Map<string, string>[] = [chunk0Map];

  for (let i = 1; i < chunks.length; i++) {
    const mapping = buildMapping(
      chunks[i - 1],
      chunks[i],
      mappings[i - 1],
      chunkSec,
      overlapSec,
    );
    mappings.push(mapping);
  }

  // Scala segmenty: każdy chunk dostarcza swój "nienapakowany" przedział.
  // Chunk 0: absolute [0, CHUNK]
  // Chunk i>0: absolute [i*CHUNK, (i+1)*CHUNK]
  // Ostatni chunk: do końca pliku.
  const result: DiarizeSegment[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const mapping = mappings[i];
    // Absolutna granica — segmenty przed tą granicą należą do tego chunka.
    const contentStart = i === 0 ? 0 : i * chunkSec;
    const contentEnd = i === chunks.length - 1 ? Infinity : (i + 1) * chunkSec;

    for (const s of chunk.segments) {
      const absStart = s.startSec + chunk.offsetSec;
      const absEnd = s.endSec + chunk.offsetSec;
      if (absStart >= contentEnd) continue;
      if (absEnd <= contentStart) continue;

      result.push({
        ...s,
        startSec: absStart,
        endSec: absEnd,
        speakerKey: mapping.get(s.speakerKey) ?? s.speakerKey,
      });
    }
  }

  result.sort((a, b) => a.startSec - b.startSec);
  return result;
}
