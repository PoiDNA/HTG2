// Merge per-participant word-level transcriptions into chronological speaker segments.
//
// Each TranscriptionResult is a single participant's audio track. We group their
// words into segments (break when pause > 1.5s) and attach the speaker role from
// the identity→role map. Then sort by start time so Claude sees dialog chronologically
// within each phase.

import type { Phase, SpeakerRole, SpeakerSegment } from './types';
import type { TranscriptionResult } from './transcribe-audio';
import type { SpeakerInfo } from './identify-speakers';

const SEGMENT_BREAK_PAUSE_SECONDS = 1.5;

export function mergePhaseToSegments(
  phase: Phase,
  transcriptions: TranscriptionResult[],
  roleMap: Map<string, SpeakerInfo>,
): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];

  for (const t of transcriptions) {
    const info: SpeakerInfo = roleMap.get(t.identity) ?? { role: 'unknown', name: t.identity };

    let current: SpeakerSegment | null = null;
    for (const w of t.words) {
      const word = (w.word ?? '').trim();
      if (!word) continue;

      if (!current || w.start - current.end > SEGMENT_BREAK_PAUSE_SECONDS) {
        if (current) segments.push(current);
        current = {
          phase,
          speaker: info.role as SpeakerRole,
          identity: t.identity,
          name: info.name,
          start: w.start,
          end: w.end,
          text: word,
        };
      } else {
        current.end = w.end;
        current.text += ' ' + word;
      }
    }
    if (current) segments.push(current);
  }

  segments.sort((a, b) => a.start - b.start);
  return segments;
}

export function concatPhases(
  wstep: SpeakerSegment[],
  sesja: SpeakerSegment[],
  podsumowanie: SpeakerSegment[],
): SpeakerSegment[] {
  return [...wstep, ...sesja, ...podsumowanie];
}
