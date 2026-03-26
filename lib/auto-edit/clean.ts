// ============================================================
// Clean stage — apply edit plan to audio tracks
// ============================================================

import type { EditPlan } from './types';
import {
  parseWavHeader,
  extractChannels,
  encodeWavBuffer,
  timeToSample,
  applyFade,
} from './wav-utils';

/** Crossfade duration in seconds when shortening silences */
const CROSSFADE_DURATION = 0.05; // 50ms

/**
 * Apply the edit plan to a WAV audio buffer.
 * - 'remove' segments are cut out entirely
 * - 'shorten' segments are reduced to targetDuration with crossfade
 * - 'keep' segments are left as-is
 *
 * Returns a new WAV buffer with edits applied.
 */
export async function cleanTrack(
  audioBuffer: ArrayBuffer,
  editPlan: EditPlan
): Promise<ArrayBuffer> {
  const header = parseWavHeader(audioBuffer);
  const channels = extractChannels(audioBuffer, header);
  const sampleRate = header.sampleRate;

  // Sort actions by start time
  const actions = [...editPlan.actions].sort((a, b) => a.start - b.start);

  // Build output segments: collect ranges of samples to include
  const outputSegments: { channels: Float32Array[]; fadeIn?: boolean; fadeOut?: boolean }[] = [];

  let currentPos = 0; // Current position in source (seconds)

  for (const action of actions) {
    // Include everything between currentPos and action.start as-is
    if (action.start > currentPos) {
      const startSample = timeToSample(currentPos, sampleRate);
      const endSample = timeToSample(action.start, sampleRate);
      if (endSample > startSample) {
        outputSegments.push({
          channels: channels.map((ch) => ch.slice(startSample, endSample)),
        });
      }
    }

    if (action.action === 'remove') {
      // Skip this segment entirely (add tiny crossfade at boundaries)
      currentPos = action.end;
    } else if (action.action === 'shorten') {
      // Keep a shortened version of this segment
      const targetDuration = action.targetDuration || 1.5;
      const originalDuration = action.end - action.start;

      if (originalDuration <= targetDuration) {
        // Already short enough, keep as-is
        const startSample = timeToSample(action.start, sampleRate);
        const endSample = timeToSample(action.end, sampleRate);
        outputSegments.push({
          channels: channels.map((ch) => ch.slice(startSample, endSample)),
        });
      } else {
        // Take beginning and end of the segment, crossfade in the middle
        const halfTarget = targetDuration / 2;
        const fadeLen = Math.min(CROSSFADE_DURATION, halfTarget);

        const segStartSample = timeToSample(action.start, sampleRate);
        const segEndSample = timeToSample(action.end, sampleRate);
        const halfSamples = timeToSample(halfTarget, sampleRate);
        const fadeSamples = timeToSample(fadeLen, sampleRate);

        // First half: from segment start
        const firstHalf = channels.map((ch) =>
          ch.slice(segStartSample, segStartSample + halfSamples)
        );
        // Apply fade-out at end of first half
        applyFade(firstHalf, halfSamples - fadeSamples, halfSamples, 'out');

        // Second half: ending at segment end
        const secondHalf = channels.map((ch) =>
          ch.slice(segEndSample - halfSamples, segEndSample)
        );
        // Apply fade-in at start of second half
        applyFade(secondHalf, 0, fadeSamples, 'in');

        // Crossfade: overlap the fade regions
        for (let ch = 0; ch < firstHalf.length; ch++) {
          for (let i = 0; i < fadeSamples; i++) {
            const firstIdx = halfSamples - fadeSamples + i;
            const secondIdx = i;
            firstHalf[ch][firstIdx] += secondHalf[ch][secondIdx];
          }
        }

        // Combine: first half + remainder of second half
        const combined = firstHalf.map((fh, ch) => {
          const result = new Float32Array(halfSamples + halfSamples - fadeSamples);
          result.set(fh, 0);
          result.set(secondHalf[ch].slice(fadeSamples), halfSamples);
          return result;
        });

        outputSegments.push({ channels: combined });
      }

      currentPos = action.end;
    } else if (action.action === 'keep') {
      // Explicitly keep this segment
      const startSample = timeToSample(action.start, sampleRate);
      const endSample = timeToSample(action.end, sampleRate);
      if (endSample > startSample) {
        outputSegments.push({
          channels: channels.map((ch) => ch.slice(startSample, endSample)),
        });
      }
      currentPos = action.end;
    }
  }

  // Include remaining audio after the last action
  const totalSamples = channels[0].length;
  const remainingStart = timeToSample(currentPos, sampleRate);
  if (remainingStart < totalSamples) {
    outputSegments.push({
      channels: channels.map((ch) => ch.slice(remainingStart)),
    });
  }

  // Concatenate all output segments
  const totalOutputSamples = outputSegments.reduce(
    (sum, seg) => sum + seg.channels[0].length,
    0
  );

  const numChannels = channels.length;
  const outputChannels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    outputChannels.push(new Float32Array(totalOutputSamples));
  }

  let writeOffset = 0;
  for (const seg of outputSegments) {
    for (let ch = 0; ch < numChannels; ch++) {
      outputChannels[ch].set(seg.channels[ch], writeOffset);
    }
    writeOffset += seg.channels[0].length;
  }

  // Apply a simple noise gate on the output
  applyNoiseGate(outputChannels, sampleRate);

  return encodeWavBuffer(outputChannels, sampleRate);
}

/**
 * Simple noise gate: silence very quiet sections (below threshold).
 * Uses a short attack/release to avoid clicking.
 */
function applyNoiseGate(
  channels: Float32Array[],
  sampleRate: number,
  thresholdDb: number = -50,
  attackMs: number = 5,
  releaseMs: number = 50
): void {
  const threshold = Math.pow(10, thresholdDb / 20);
  const attackSamples = Math.floor((attackMs / 1000) * sampleRate);
  const releaseSamples = Math.floor((releaseMs / 1000) * sampleRate);
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms window

  const numSamples = channels[0].length;
  const envelope = new Float32Array(numSamples);

  // Compute envelope using RMS of all channels
  for (let i = 0; i < numSamples; i++) {
    let sum = 0;
    const start = Math.max(0, i - windowSize);
    const end = Math.min(numSamples, i + windowSize);
    for (let j = start; j < end; j++) {
      for (const ch of channels) {
        sum += ch[j] * ch[j];
      }
    }
    envelope[i] = Math.sqrt(sum / ((end - start) * channels.length));
  }

  // Apply gate with smooth attack/release
  let gateGain = 0;
  for (let i = 0; i < numSamples; i++) {
    const target = envelope[i] > threshold ? 1 : 0;
    if (target > gateGain) {
      gateGain = Math.min(1, gateGain + 1 / attackSamples);
    } else {
      gateGain = Math.max(0, gateGain - 1 / releaseSamples);
    }
    for (const ch of channels) {
      ch[i] *= gateGain;
    }
  }
}
