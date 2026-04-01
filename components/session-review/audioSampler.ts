// ---------------------------------------------------------------------------
// AudioSampler — imperative FFT analysis engine
//
// NOT a React hook. Called directly from MandalaCanvas's rAF loop.
// Does not trigger React re-renders. Pre-allocates all buffers.
// ---------------------------------------------------------------------------

import type { AudioBands } from './patterns/types';
import { SILENT_BANDS } from './patterns/types';

export type AnalysisState = 'reactive' | 'ambient-fallback';

/**
 * Computes band boundaries dynamically from the analyser's sample rate.
 * Returns bin indices for each frequency band boundary.
 */
function computeBandBoundaries(analyser: AnalyserNode) {
  const sampleRate = analyser.context.sampleRate;
  const fftSize = analyser.fftSize;
  const binCount = analyser.frequencyBinCount; // fftSize / 2

  // Convert frequency to bin index
  const freqToBin = (freq: number) =>
    Math.min(Math.round((freq * fftSize) / sampleRate), binCount - 1);

  return {
    bassStart: freqToBin(20),
    bassEnd: freqToBin(250),
    midStart: freqToBin(250),
    midEnd: freqToBin(2000),
    highStart: freqToBin(2000),
    highEnd: freqToBin(8000),
  };
}

/**
 * Computes average energy for a range of frequency bins.
 * Values are normalized from 0-255 (Uint8Array) to 0-1.
 */
function bandEnergy(data: Uint8Array<ArrayBufferLike>, start: number, end: number): number {
  if (start >= end) return 0;
  let sum = 0;
  for (let i = start; i <= end; i++) {
    sum += data[i];
  }
  return sum / ((end - start + 1) * 255);
}

/** Exponential moving average for smooth transitions */
function ema(prev: number, next: number, alpha: number): number {
  return prev + alpha * (next - prev);
}

const SMOOTHING_ALPHA = 0.15;
const SILENCE_THRESHOLD = 0.01;
/** Number of consecutive silent samples before switching to ambient-fallback */
const AMBIENT_FALLBACK_SAMPLES = 60; // ~1 second at 60fps

export class AudioSampler {
  private readonly analyser: AnalyserNode;
  private readonly buffer: Uint8Array<ArrayBuffer>;
  private readonly bands: ReturnType<typeof computeBandBoundaries>;

  private smoothed: AudioBands = { ...SILENT_BANDS };
  private silentSampleCount = 0;

  private _state: AnalysisState = 'reactive';

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.buffer = new Uint8Array(analyser.frequencyBinCount);
    this.bands = computeBandBoundaries(analyser);
  }

  /** Current analysis state. Read by MandalaCanvas to decide rendering mode. */
  get state(): AnalysisState {
    return this._state;
  }

  /**
   * Sample current FFT data and return smoothed audio bands.
   * Called once per rAF frame from MandalaCanvas.
   */
  sample(): AudioBands {
    this.analyser.getByteFrequencyData(this.buffer);

    const rawEnergy = bandEnergy(this.buffer, this.bands.bassStart, this.bands.bassEnd);
    const rawMid = bandEnergy(this.buffer, this.bands.midStart, this.bands.midEnd);
    const rawHigh = bandEnergy(this.buffer, this.bands.highStart, this.bands.highEnd);
    const rawTotal = (rawEnergy + rawMid + rawHigh) / 3;

    // Smooth with EMA
    this.smoothed = {
      energy: ema(this.smoothed.energy, rawEnergy, SMOOTHING_ALPHA),
      midEnergy: ema(this.smoothed.midEnergy, rawMid, SMOOTHING_ALPHA),
      highEnergy: ema(this.smoothed.highEnergy, rawHigh, SMOOTHING_ALPHA),
      totalEnergy: ema(this.smoothed.totalEnergy, rawTotal, SMOOTHING_ALPHA),
      isSilent: rawTotal < SILENCE_THRESHOLD,
    };

    // Track consecutive silent samples for ambient-fallback detection.
    // Note: we do NOT check volume/muted — a muted user should not trigger fallback.
    if (rawTotal < SILENCE_THRESHOLD) {
      this.silentSampleCount++;
    } else {
      this.silentSampleCount = 0;
      // Recover from ambient-fallback if we get real data
      if (this._state === 'ambient-fallback') {
        this._state = 'reactive';
      }
    }

    // Switch to ambient-fallback if consistently silent
    if (this.silentSampleCount >= AMBIENT_FALLBACK_SAMPLES && this._state === 'reactive') {
      this._state = 'ambient-fallback';
    }

    return this.smoothed;
  }

  /** Reset state — called when audio source changes (e.g., token refresh) */
  reset(): void {
    this.smoothed = { ...SILENT_BANDS };
    this.silentSampleCount = 0;
    this._state = 'reactive';
  }
}
