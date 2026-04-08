import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeSessionJourney } from '../analyze';
import { AnalysisError } from '../errors';
import type { SpeakerSegment } from '../types';

const ORIG_KEY = process.env.ANTHROPIC_API_KEY;

function makeSegment(overrides: Partial<SpeakerSegment> = {}): SpeakerSegment {
  return {
    phase: 'wstep',
    speaker: 'client',
    identity: 'client-1',
    name: 'Anna',
    start: 0,
    end: 5,
    text: 'sample text',
    ...overrides,
  };
}

function makeClaudeResponse(jsonPayload: string) {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: jsonPayload }],
    }),
    { status: 200 },
  );
}

const VALID_INSIGHTS = {
  problems: [],
  emotional_states: [],
  life_events: [],
  goals: [],
  breakthroughs: [],
  journey_summary: 'Klientka przyszła z X. W sesji Y. Wychodzi z Z.',
  summary: 'Digest.',
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIG_KEY;
});

describe('analyzeSessionJourney', () => {
  it('throws no_client_tracks for empty transcript (before API check)', async () => {
    // API key is set via beforeEach; empty transcript check runs first
    try {
      await analyzeSessionJourney([]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('no_client_tracks');
    }
  });

  it('throws claude_api_error when API key missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await analyzeSessionJourney([makeSegment()]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('claude_api_error');
    }
  });

  it('parses valid JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeClaudeResponse(JSON.stringify(VALID_INSIGHTS))),
    );

    const result = await analyzeSessionJourney([makeSegment()]);
    expect(result.journey_summary).toContain('Klientka');
    expect(result.problems).toEqual([]);
    expect(Array.isArray(result.breakthroughs)).toBe(true);
  });

  it('strips ```json ... ``` markdown fences', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_INSIGHTS) + '\n```';
    vi.stubGlobal('fetch', vi.fn(async () => makeClaudeResponse(fenced)));

    const result = await analyzeSessionJourney([makeSegment()]);
    expect(result.summary).toBe('Digest.');
  });

  it('strips plain ``` fences without language tag', async () => {
    const fenced = '```\n' + JSON.stringify(VALID_INSIGHTS) + '\n```';
    vi.stubGlobal('fetch', vi.fn(async () => makeClaudeResponse(fenced)));

    const result = await analyzeSessionJourney([makeSegment()]);
    expect(result.summary).toBe('Digest.');
  });

  it('throws invalid_json_response for unparseable text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeClaudeResponse('not json at all {{{')));

    try {
      await analyzeSessionJourney([makeSegment()]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('invalid_json_response');
    }
  });

  it('throws invalid_json_response when required array missing', async () => {
    const bad = { journey_summary: 'x', summary: 'y' }; // missing all arrays
    vi.stubGlobal('fetch', vi.fn(async () => makeClaudeResponse(JSON.stringify(bad))));

    try {
      await analyzeSessionJourney([makeSegment()]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('invalid_json_response');
    }
  });

  it('throws invalid_json_response when required string missing', async () => {
    const bad = { ...VALID_INSIGHTS, journey_summary: undefined };
    vi.stubGlobal('fetch', vi.fn(async () => makeClaudeResponse(JSON.stringify(bad))));

    try {
      await analyzeSessionJourney([makeSegment()]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('invalid_json_response');
    }
  });

  it('throws claude_api_error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    );

    try {
      await analyzeSessionJourney([makeSegment()]);
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnalysisError).code).toBe('claude_api_error');
      expect((e as AnalysisError).message).not.toContain('server error');
      expect((e as AnalysisError).message).toBe('status_500');
    }
  });

  it('sends system prompt and user content to Claude', async () => {
    const fetchMock = vi.fn(async () => makeClaudeResponse(JSON.stringify(VALID_INSIGHTS)));
    vi.stubGlobal('fetch', fetchMock);

    const segments = [
      makeSegment({ phase: 'wstep', text: 'przyszłam z lękiem' }),
      makeSegment({ phase: 'sesja', speaker: 'host', name: 'Natalia', text: 'jak się czujesz' }),
      makeSegment({ phase: 'podsumowanie', text: 'ulga' }),
    ];

    await analyzeSessionJourney(segments);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.system).toContain('Natalii');
    expect(body.messages[0].content).toContain('przyszłam z lękiem');
    expect(body.messages[0].content).toContain('=== WSTEP ===');
    expect(body.messages[0].content).toContain('=== SESJA ===');
    expect(body.messages[0].content).toContain('=== PODSUMOWANIE ===');
  });
});
