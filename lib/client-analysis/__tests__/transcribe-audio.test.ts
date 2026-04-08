import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transcribeAudio } from '../transcribe-audio';
import { AnalysisError } from '../errors';

const ORIG_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIG_KEY;
});

describe('transcribeAudio', () => {
  it('throws whisper_api_error when OPENAI_API_KEY missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const buf = new ArrayBuffer(1024);
    await expect(
      transcribeAudio(buf, 'id-1', 'https://r2/test.ogg'),
    ).rejects.toThrow(AnalysisError);
  });

  it('throws file_too_large for buffers over 25 MB', async () => {
    const oversized = new ArrayBuffer(26 * 1024 * 1024);
    try {
      await transcribeAudio(oversized, 'id-1', 'https://r2/test.ogg');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AnalysisError);
      expect((e as AnalysisError).code).toBe('file_too_large');
    }
  });

  it('sends audio/ogg content type for .ogg URLs', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          text: 'hello',
          duration: 1.5,
          words: [{ word: 'hello', start: 0, end: 1.5 }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const buf = new ArrayBuffer(1024);
    const result = await transcribeAudio(buf, 'id-1', 'https://r2/recordings/room/analytics/id-1.ogg');

    expect(result.text).toBe('hello');
    expect(result.words).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    const file = form.get('file') as File;
    expect(file.type).toBe('audio/ogg');
    expect(file.name.endsWith('.ogg')).toBe(true);
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('pl');
    expect(form.get('response_format')).toBe('verbose_json');
  });

  it('derives audio/mp4 for .mp4 URLs', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ text: '', duration: 0, words: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await transcribeAudio(new ArrayBuffer(100), 'id', 'https://r2/file.mp4');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const file = (init.body as FormData).get('file') as File;
    expect(file.type).toBe('audio/mp4');
  });

  it('throws whisper_api_error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    );

    try {
      await transcribeAudio(new ArrayBuffer(100), 'id', 'https://r2/file.ogg');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AnalysisError);
      expect((e as AnalysisError).code).toBe('whisper_api_error');
      // Verify no response body leakage in error message
      expect((e as AnalysisError).message).not.toContain('rate limited');
      expect((e as AnalysisError).message).toBe('status_429');
    }
  });

  it('handles missing words array gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ text: 'hello', duration: 1 }), { status: 200 }),
      ),
    );

    const result = await transcribeAudio(new ArrayBuffer(100), 'id', 'https://r2/f.ogg');
    expect(result.words).toEqual([]);
    expect(result.text).toBe('hello');
  });
});
