// ============================================================
// WAV Encoder — Encode AudioBuffer to WAV Blob (PCM 16-bit)
// ============================================================

/**
 * Encode an AudioBuffer to a WAV Blob (PCM 16-bit, original sample rate).
 */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data and convert to 16-bit PCM
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Mix multiple AudioBuffers into a single stereo buffer.
 * Each buffer is mixed with the given volume multiplier.
 */
export function mixBuffers(
  buffers: { buffer: AudioBuffer; volume: number }[],
  audioCtx: BaseAudioContext
): AudioBuffer {
  if (buffers.length === 0) {
    return audioCtx.createBuffer(2, 1, 48000);
  }

  const sampleRate = buffers[0].buffer.sampleRate;
  let maxLength = 0;
  for (const b of buffers) {
    if (b.buffer.length > maxLength) maxLength = b.buffer.length;
  }

  const output = audioCtx.createBuffer(2, maxLength, sampleRate);
  const outL = output.getChannelData(0);
  const outR = output.getChannelData(1);

  for (const { buffer, volume } of buffers) {
    const numCh = buffer.numberOfChannels;
    const srcL = buffer.getChannelData(0);
    const srcR = numCh > 1 ? buffer.getChannelData(1) : srcL;
    const len = buffer.length;

    for (let i = 0; i < len; i++) {
      outL[i] += srcL[i] * volume;
      outR[i] += srcR[i] * volume;
    }
  }

  return output;
}
