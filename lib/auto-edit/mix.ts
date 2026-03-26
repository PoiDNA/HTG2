// ============================================================
// Mix stage — combine cleaned tracks + intro/outro music
// ============================================================

import {
  parseWavHeader,
  extractChannels,
  encodeWavBuffer,
  applyFade,
  timeToSample,
} from './wav-utils';

/** Intro music fade-in duration in seconds */
const INTRO_FADE_DURATION = 5;
/** Outro music fade-out duration in seconds */
const OUTRO_FADE_DURATION = 10;
/** Crossfade between intro music and speech */
const INTRO_CROSSFADE = 2;
/** Crossfade between speech and outro music */
const OUTRO_CROSSFADE = 2;
/** Music volume during speech (ducking) */
const MUSIC_DUCK_VOLUME = 0.0; // Full duck — no music during speech

/**
 * Mix all cleaned tracks into a single stereo file with optional intro/outro music.
 */
export async function mixTracks(
  cleanedBuffers: ArrayBuffer[],
  introBuffer?: ArrayBuffer | null,
  outroBuffer?: ArrayBuffer | null
): Promise<ArrayBuffer> {
  if (cleanedBuffers.length === 0) {
    throw new Error('No tracks to mix');
  }

  // Parse all tracks
  const tracks = cleanedBuffers.map((buf) => {
    const header = parseWavHeader(buf);
    const channels = extractChannels(buf, header);
    return { header, channels };
  });

  // Use the first track's sample rate as reference
  const sampleRate = tracks[0].header.sampleRate;

  // Find the longest track
  const maxTrackSamples = tracks.reduce(
    (max, t) => Math.max(max, t.channels[0].length),
    0
  );

  // Parse intro/outro if provided
  let introChannels: Float32Array[] | null = null;
  let introSamples = 0;
  if (introBuffer) {
    const introHeader = parseWavHeader(introBuffer);
    introChannels = extractChannels(introBuffer, introHeader);
    introSamples = introChannels[0].length;
    // Ensure stereo
    if (introChannels.length === 1) {
      introChannels = [introChannels[0], introChannels[0].slice()];
    }
  }

  let outroChannels: Float32Array[] | null = null;
  let outroSamples = 0;
  if (outroBuffer) {
    const outroHeader = parseWavHeader(outroBuffer);
    outroChannels = extractChannels(outroBuffer, outroHeader);
    outroSamples = outroChannels[0].length;
    if (outroChannels.length === 1) {
      outroChannels = [outroChannels[0], outroChannels[0].slice()];
    }
  }

  // Calculate total output length
  const introPadSamples = introChannels
    ? Math.max(0, introSamples - timeToSample(INTRO_CROSSFADE, sampleRate))
    : 0;
  const outroPadSamples = outroChannels
    ? Math.max(0, outroSamples - timeToSample(OUTRO_CROSSFADE, sampleRate))
    : 0;

  const totalSamples = introPadSamples + maxTrackSamples + outroPadSamples;

  // Create stereo output
  const outputL = new Float32Array(totalSamples);
  const outputR = new Float32Array(totalSamples);

  // Mix intro music
  if (introChannels) {
    const fadeSamples = timeToSample(INTRO_FADE_DURATION, sampleRate);
    // Copy intro and apply fade-in
    for (let i = 0; i < introSamples && i < totalSamples; i++) {
      const fadeGain = i < fadeSamples ? i / fadeSamples : 1;
      // Fade out at end of intro (during crossfade with speech)
      const crossfadeSamples = timeToSample(INTRO_CROSSFADE, sampleRate);
      const distFromEnd = introSamples - i;
      const crossGain = distFromEnd < crossfadeSamples ? distFromEnd / crossfadeSamples : 1;
      const gain = fadeGain * crossGain;
      outputL[i] += introChannels[0][i] * gain;
      outputR[i] += introChannels[1][i] * gain;
    }
  }

  // Mix speech tracks (offset by intro pad)
  const speechOffset = introPadSamples;
  for (const track of tracks) {
    const numCh = track.channels.length;
    const srcL = track.channels[0];
    const srcR = numCh > 1 ? track.channels[1] : srcL;
    const len = srcL.length;

    for (let i = 0; i < len; i++) {
      const outIdx = speechOffset + i;
      if (outIdx < totalSamples) {
        outputL[outIdx] += srcL[i];
        outputR[outIdx] += srcR[i];
      }
    }
  }

  // Mix outro music
  if (outroChannels) {
    const outroStart = introPadSamples + maxTrackSamples - timeToSample(OUTRO_CROSSFADE, sampleRate);
    const fadeSamples = timeToSample(OUTRO_FADE_DURATION, sampleRate);

    for (let i = 0; i < outroSamples; i++) {
      const outIdx = outroStart + i;
      if (outIdx >= 0 && outIdx < totalSamples) {
        // Fade-in at start
        const crossfadeSamples = timeToSample(OUTRO_CROSSFADE, sampleRate);
        const fadeInGain = i < crossfadeSamples ? i / crossfadeSamples : 1;
        // Fade-out at end
        const distFromEnd = outroSamples - i;
        const fadeOutGain = distFromEnd < fadeSamples ? distFromEnd / fadeSamples : 1;
        const gain = fadeInGain * fadeOutGain;
        outputL[outIdx] += outroChannels[0][i] * gain;
        outputR[outIdx] += outroChannels[1][i] * gain;
      }
    }
  }

  // Clip protection
  clipProtect(outputL);
  clipProtect(outputR);

  return encodeWavBuffer([outputL, outputR], sampleRate);
}

/**
 * Soft-clip samples that exceed [-1, 1] range.
 */
function clipProtect(channel: Float32Array): void {
  for (let i = 0; i < channel.length; i++) {
    if (channel[i] > 1) channel[i] = 1;
    else if (channel[i] < -1) channel[i] = -1;
  }
}
