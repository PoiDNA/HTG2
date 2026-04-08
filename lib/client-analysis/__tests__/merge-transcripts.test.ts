import { describe, it, expect } from 'vitest';
import { mergePhaseToSegments, concatPhases } from '../merge-transcripts';
import type { SpeakerInfo } from '../identify-speakers';
import type { TranscriptionResult } from '../transcribe-audio';

const ROLE_MAP = new Map<string, SpeakerInfo>([
  ['client-uuid', { role: 'client', name: 'Anna' }],
  ['host-uuid', { role: 'host', name: 'Natalia' }],
  ['unknown-uuid', { role: 'unknown', name: 'unknown-uuid' }],
]);

function makeTrack(
  identity: string,
  words: Array<[string, number, number]>,
  duration = 60,
): TranscriptionResult {
  return {
    identity,
    text: words.map(([w]) => w).join(' '),
    words: words.map(([word, start, end]) => ({ word, start, end })),
    duration,
  };
}

describe('mergePhaseToSegments', () => {
  it('groups contiguous words from one participant into a single segment', () => {
    const track = makeTrack('client-uuid', [
      ['Dzień', 0.0, 0.3],
      ['dobry', 0.35, 0.7],
      ['Natalio', 0.8, 1.2],
    ]);

    const segments = mergePhaseToSegments('wstep', [track], ROLE_MAP);

    expect(segments).toHaveLength(1);
    expect(segments[0].phase).toBe('wstep');
    expect(segments[0].speaker).toBe('client');
    expect(segments[0].identity).toBe('client-uuid');
    expect(segments[0].text).toBe('Dzień dobry Natalio');
    expect(segments[0].start).toBe(0.0);
    expect(segments[0].end).toBe(1.2);
  });

  it('breaks segment on pause > 1.5s for same speaker', () => {
    const track = makeTrack('client-uuid', [
      ['Tak', 0.0, 0.3],
      // 2s pause
      ['I', 2.4, 2.5],
      ['potem', 2.6, 3.0],
    ]);

    const segments = mergePhaseToSegments('wstep', [track], ROLE_MAP);

    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Tak');
    expect(segments[1].text).toBe('I potem');
  });

  it('interleaves segments from multiple participants chronologically', () => {
    const host = makeTrack('host-uuid', [
      ['Jak', 0.0, 0.2],
      ['się', 0.3, 0.5],
      ['masz', 0.55, 0.8],
    ]);
    const client = makeTrack('client-uuid', [
      ['Dobrze', 1.5, 2.0],
      ['dziękuję', 2.1, 2.6],
    ]);

    const segments = mergePhaseToSegments('sesja', [host, client], ROLE_MAP);

    expect(segments).toHaveLength(2);
    expect(segments[0].speaker).toBe('host');
    expect(segments[0].text).toBe('Jak się masz');
    expect(segments[1].speaker).toBe('client');
    expect(segments[1].text).toBe('Dobrze dziękuję');
  });

  it('assigns "unknown" role for participants not in map', () => {
    const track = makeTrack('stranger', [['Hej', 0, 0.5]]);
    const segments = mergePhaseToSegments('wstep', [track], ROLE_MAP);

    expect(segments).toHaveLength(1);
    expect(segments[0].speaker).toBe('unknown');
    expect(segments[0].name).toBe('stranger');
  });

  it('skips empty/whitespace words', () => {
    const track = makeTrack('client-uuid', [
      ['Tak', 0, 0.3],
      ['', 0.35, 0.4],
      ['  ', 0.45, 0.5],
      ['jest', 0.6, 0.9],
    ]);

    const segments = mergePhaseToSegments('wstep', [track], ROLE_MAP);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Tak jest');
  });

  it('returns empty array for empty input', () => {
    expect(mergePhaseToSegments('wstep', [], ROLE_MAP)).toEqual([]);
  });

  it('passes phase label through to segments', () => {
    const track = makeTrack('client-uuid', [['X', 0, 0.5]]);
    const segments = mergePhaseToSegments('podsumowanie', [track], ROLE_MAP);
    expect(segments[0].phase).toBe('podsumowanie');
  });
});

describe('concatPhases', () => {
  it('concatenates in order wstep → sesja → podsumowanie', () => {
    const wstep = [
      { phase: 'wstep' as const, speaker: 'client' as const, identity: 'c', name: 'A', start: 0, end: 1, text: 'w' },
    ];
    const sesja = [
      { phase: 'sesja' as const, speaker: 'client' as const, identity: 'c', name: 'A', start: 0, end: 1, text: 's' },
    ];
    const podsumowanie = [
      { phase: 'podsumowanie' as const, speaker: 'client' as const, identity: 'c', name: 'A', start: 0, end: 1, text: 'p' },
    ];
    const result = concatPhases(wstep, sesja, podsumowanie);
    expect(result.map((s) => s.text)).toEqual(['w', 's', 'p']);
  });

  it('handles empty phases', () => {
    const wstep = [
      { phase: 'wstep' as const, speaker: 'client' as const, identity: 'c', name: 'A', start: 0, end: 1, text: 'only-wstep' },
    ];
    const result = concatPhases(wstep, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('only-wstep');
  });
});
