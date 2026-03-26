// ============================================================
// Master stage — normalize, compress, limit
// ============================================================

import {
  parseWavHeader,
  extractChannels,
  encodeWavBuffer,
  computePeak,
  computeRms,
} from './wav-utils';

/** Target peak level in dB */
const TARGET_PEAK_DB = -1;
/** Compressor threshold in dB */
const COMPRESSOR_THRESHOLD_DB = -18;
/** Compressor ratio */
const COMPRESSOR_RATIO = 3;
/** Compressor attack in ms */
const COMPRESSOR_ATTACK_MS = 10;
/** Compressor release in ms */
const COMPRESSOR_RELEASE_MS = 100;
/** Limiter ceiling in dB */
const LIMITER_CEILING_DB = -0.5;

/**
 * Master the mixed audio: normalize, compress, limit.
 */
export async function masterAudio(mixedBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const header = parseWavHeader(mixedBuffer);
  const channels = extractChannels(mixedBuffer, header);
  const sampleRate = header.sampleRate;

  // Step 1: Normalize to target peak
  normalize(channels, TARGET_PEAK_DB);

  // Step 2: Gentle compression
  compress(channels, sampleRate, {
    thresholdDb: COMPRESSOR_THRESHOLD_DB,
    ratio: COMPRESSOR_RATIO,
    attackMs: COMPRESSOR_ATTACK_MS,
    releaseMs: COMPRESSOR_RELEASE_MS,
  });

  // Step 3: Normalize again after compression
  normalize(channels, TARGET_PEAK_DB);

  // Step 4: Brick-wall limiter
  limit(channels, LIMITER_CEILING_DB);

  return encodeWavBuffer(channels, sampleRate);
}

/**
 * Normalize all channels so peak level matches targetDb.
 */
function normalize(channels: Float32Array[], targetDb: number): void {
  const targetLinear = Math.pow(10, targetDb / 20);

  // Find global peak across all channels
  let globalPeak = 0;
  for (const ch of channels) {
    const peak = computePeak(ch);
    if (peak > globalPeak) globalPeak = peak;
  }

  if (globalPeak === 0) return; // Silent audio

  const gain = targetLinear / globalPeak;

  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] *= gain;
    }
  }
}

interface CompressorOptions {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
}

/**
 * Apply gentle compression to audio.
 * Uses a simple envelope follower with attack/release.
 */
function compress(
  channels: Float32Array[],
  sampleRate: number,
  opts: CompressorOptions
): void {
  const threshold = Math.pow(10, opts.thresholdDb / 20);
  const attackCoeff = Math.exp(-1 / ((opts.attackMs / 1000) * sampleRate));
  const releaseCoeff = Math.exp(-1 / ((opts.releaseMs / 1000) * sampleRate));
  const numSamples = channels[0].length;

  // Compute gain reduction based on envelope
  let envelope = 0;

  for (let i = 0; i < numSamples; i++) {
    // Get max absolute value across channels at this sample
    let inputLevel = 0;
    for (const ch of channels) {
      const abs = Math.abs(ch[i]);
      if (abs > inputLevel) inputLevel = abs;
    }

    // Envelope follower
    if (inputLevel > envelope) {
      envelope = attackCoeff * envelope + (1 - attackCoeff) * inputLevel;
    } else {
      envelope = releaseCoeff * envelope + (1 - releaseCoeff) * inputLevel;
    }

    // Compute gain reduction
    let gain = 1;
    if (envelope > threshold) {
      const overDb = 20 * Math.log10(envelope / threshold);
      const reducedDb = overDb * (1 - 1 / opts.ratio);
      gain = Math.pow(10, -reducedDb / 20);
    }

    // Apply gain to all channels
    for (const ch of channels) {
      ch[i] *= gain;
    }
  }
}

/**
 * Brick-wall limiter: hard clip at ceiling level.
 */
function limit(channels: Float32Array[], ceilingDb: number): void {
  const ceiling = Math.pow(10, ceilingDb / 20);

  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] > ceiling) ch[i] = ceiling;
      else if (ch[i] < -ceiling) ch[i] = -ceiling;
    }
  }
}
