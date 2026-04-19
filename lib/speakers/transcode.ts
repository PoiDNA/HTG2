/**
 * Transcode audio buffer do słabego mp3 mono (24 kbps) via systemowy ffmpeg.
 *
 * Motywacja PR 6 (backfill biblioteczny HTG-Month):
 *   - Pliki m4a/m4v w Bunny Storage mają 70-140 MB (limit OpenAI diarize = 25 MB).
 *   - Zawartość = mowa (lektor + uczestnicy), więc niska jakość nie szkodzi diarize.
 *   - Konwersja do 24 kbps mono mp3 daje ~20 MB dla 2h nagrania → mieści się
 *     w single-request diarize → spójne speaker keys (brak chunk prefixów).
 *
 * Wymagania: `ffmpeg` w PATH (skrypt lokalny, NIE Vercel runtime).
 *   Endpoint serwerowy (app/api/.../diarize) nie używa tego helpera — dla plików
 *   >25 MB w produkcji zwraca 413; pokrycie idzie przez ten backfill.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface TranscodeOptions {
  /** Bitrate docelowy w kbps. Default 24 (mowa mono). */
  bitrateKbps?: number;
  /** Sample rate. Default 22050 (wystarczające dla mowy). */
  sampleRate?: number;
}

export interface TranscodeResult {
  mp3Buffer: Buffer;
  originalBytes: number;
  outputBytes: number;
  elapsedMs: number;
}

/**
 * Konwertuje audio (dowolny format akceptowany przez ffmpeg) na słabe mp3 mono.
 * Zapisuje tymczasowo na dysk (ffmpeg musi mieć file IO), sprząta po sobie.
 */
export async function transcodeToLowMp3(
  inputBuffer: Buffer,
  inputExt: string,
  opts: TranscodeOptions = {},
): Promise<TranscodeResult> {
  const bitrate = opts.bitrateKbps ?? 24;
  const sampleRate = opts.sampleRate ?? 22050;
  const start = Date.now();

  const dir = await mkdtemp(join(tmpdir(), 'htg-transcode-'));
  const inputPath = join(dir, `in.${inputExt.replace(/^\./, '')}`);
  const outputPath = join(dir, 'out.mp3');

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', String(sampleRate),
        '-b:a', `${bitrate}k`,
        '-f', 'mp3',
        outputPath,
      ]);

      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c.toString(); });
      ff.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)));
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      });
    });

    const mp3Buffer = await readFile(outputPath);
    return {
      mp3Buffer,
      originalBytes: inputBuffer.byteLength,
      outputBytes: mp3Buffer.byteLength,
      elapsedMs: Date.now() - start,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface TranscodeChunk {
  buffer: Buffer;
  offsetSec: number;
  idx: number;
}

export interface TranscodeChunksResult {
  chunks: TranscodeChunk[];
  originalBytes: number;
  elapsedMs: number;
}

/**
 * Transcode + segmentacja czasowa w jednym przebiegu ffmpeg.
 *
 * Motywacja: gpt-4o-transcribe-diarize ma limit 1400 s per request. Dla sesji
 * >23 min trzeba chunkować. Robimy to razem z transcode (24 kbps mono mp3),
 * żeby jedno wywołanie ffmpeg dało gotowe segmenty do diarize.
 *
 * Speaker keys między chunkami są niezależne — caller musi dodać prefix
 * (np. `c{idx}_{key}`) przed zapisem do DB.
 */
export async function transcodeAndChunkToMp3(
  inputBuffer: Buffer,
  inputExt: string,
  chunkSeconds: number,
  opts: TranscodeOptions = {},
): Promise<TranscodeChunksResult> {
  const bitrate = opts.bitrateKbps ?? 24;
  const sampleRate = opts.sampleRate ?? 22050;
  const start = Date.now();

  const dir = await mkdtemp(join(tmpdir(), 'htg-chunk-'));
  const inputPath = join(dir, `in.${inputExt.replace(/^\./, '')}`);
  const outputPattern = join(dir, 'out_%03d.mp3');

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', String(sampleRate),
        '-b:a', `${bitrate}k`,
        '-f', 'segment',
        '-segment_time', String(chunkSeconds),
        '-reset_timestamps', '1',
        outputPattern,
      ]);
      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c.toString(); });
      ff.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)));
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      });
    });

    const files = (await readdir(dir))
      .filter((f) => f.startsWith('out_') && f.endsWith('.mp3'))
      .sort();

    const chunks: TranscodeChunk[] = [];
    for (let i = 0; i < files.length; i++) {
      const buf = await readFile(join(dir, files[i]));
      chunks.push({ buffer: buf, offsetSec: i * chunkSeconds, idx: i });
    }

    return {
      chunks,
      originalBytes: inputBuffer.byteLength,
      elapsedMs: Date.now() - start,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
