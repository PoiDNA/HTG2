// ============================================================
// Server-side WAV utilities — pure PCM buffer manipulation
// No Web Audio API dependency (runs in API routes / Node.js)
// ============================================================

/** Parsed WAV header information */
export interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  bytesPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  totalSamples: number;
  duration: number;
}

/**
 * Parse a WAV file header and return format info.
 * Supports standard PCM WAV (format code 1).
 */
export function parseWavHeader(buffer: ArrayBuffer): WavHeader {
  const view = new DataView(buffer);

  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') {
    throw new Error('Not a valid WAV file: missing RIFF header');
  }

  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (wave !== 'WAVE') {
    throw new Error('Not a valid WAV file: missing WAVE identifier');
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;

  while (offset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      const format = view.getUint16(offset + 8, true);
      if (format !== 1 && format !== 3) {
        throw new Error(`Unsupported WAV format: ${format} (only PCM 1 and IEEE float 3 supported)`);
      }
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      fmtFound = true;
    }

    if (chunkId === 'data') {
      if (!fmtFound) {
        throw new Error('WAV file has data chunk before fmt chunk');
      }
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numChannels * bytesPerSample;
      const totalSamples = chunkSize / blockAlign;
      const duration = totalSamples / sampleRate;

      return {
        sampleRate,
        numChannels,
        bitsPerSample,
        bytesPerSample,
        blockAlign,
        dataOffset: offset + 8,
        dataSize: chunkSize,
        totalSamples,
        duration,
      };
    }

    offset += 8 + chunkSize;
    // Chunks must be word-aligned
    if (chunkSize % 2 !== 0) offset++;
  }

  throw new Error('WAV file missing data chunk');
}

/**
 * Extract raw PCM samples from a WAV buffer as Float32Arrays (one per channel).
 */
export function extractChannels(buffer: ArrayBuffer, header: WavHeader): Float32Array[] {
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < header.numChannels; ch++) {
    channels.push(new Float32Array(header.totalSamples));
  }

  let readOffset = header.dataOffset;
  for (let i = 0; i < header.totalSamples; i++) {
    for (let ch = 0; ch < header.numChannels; ch++) {
      let sample: number;
      if (header.bitsPerSample === 16) {
        sample = view.getInt16(readOffset, true) / 32768;
      } else if (header.bitsPerSample === 24) {
        const b0 = view.getUint8(readOffset);
        const b1 = view.getUint8(readOffset + 1);
        const b2 = view.getUint8(readOffset + 2);
        const raw = (b2 << 16) | (b1 << 8) | b0;
        sample = (raw > 0x7fffff ? raw - 0x1000000 : raw) / 8388608;
      } else if (header.bitsPerSample === 32) {
        sample = view.getFloat32(readOffset, true);
      } else {
        throw new Error(`Unsupported bit depth: ${header.bitsPerSample}`);
      }
      channels[ch][i] = sample;
      readOffset += header.bytesPerSample;
    }
  }

  return channels;
}

/**
 * Encode Float32Array channels back into a WAV ArrayBuffer (16-bit PCM).
 */
export function encodeWavBuffer(
  channels: Float32Array[],
  sampleRate: number
): ArrayBuffer {
  const numChannels = channels.length;
  const numSamples = channels[0].length;
  const bitsPerSample = 16;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert time in seconds to sample index.
 */
export function timeToSample(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/**
 * Apply a linear fade between two sample positions.
 * direction: 'in' fades from 0→1, 'out' fades from 1→0.
 */
export function applyFade(
  channels: Float32Array[],
  startSample: number,
  endSample: number,
  direction: 'in' | 'out'
): void {
  const length = endSample - startSample;
  if (length <= 0) return;

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const gain = direction === 'in' ? t : 1 - t;
    for (const channel of channels) {
      channel[startSample + i] *= gain;
    }
  }
}

/**
 * Zero out samples in the given range across all channels.
 */
export function silenceRange(
  channels: Float32Array[],
  startSample: number,
  endSample: number
): void {
  for (const channel of channels) {
    for (let i = startSample; i < endSample && i < channel.length; i++) {
      channel[i] = 0;
    }
  }
}

/**
 * Compute RMS level of a channel.
 */
export function computeRms(channel: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < channel.length; i++) {
    sum += channel[i] * channel[i];
  }
  return Math.sqrt(sum / channel.length);
}

/**
 * Compute peak level of a channel.
 */
export function computePeak(channel: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < channel.length; i++) {
    const abs = Math.abs(channel[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Split a WAV buffer into chunks of maxDurationSeconds.
 * Returns array of { buffer, startTime, endTime }.
 */
export function splitWavIntoChunks(
  wavBuffer: ArrayBuffer,
  maxDurationSeconds: number
): { buffer: ArrayBuffer; startTime: number; endTime: number }[] {
  const header = parseWavHeader(wavBuffer);
  const channels = extractChannels(wavBuffer, header);
  const samplesPerChunk = Math.floor(maxDurationSeconds * header.sampleRate);

  const chunks: { buffer: ArrayBuffer; startTime: number; endTime: number }[] = [];
  let offset = 0;

  while (offset < header.totalSamples) {
    const end = Math.min(offset + samplesPerChunk, header.totalSamples);
    const chunkChannels = channels.map((ch) => ch.slice(offset, end));
    const chunkBuffer = encodeWavBuffer(chunkChannels, header.sampleRate);
    const startTime = offset / header.sampleRate;
    const endTime = end / header.sampleRate;
    chunks.push({ buffer: chunkBuffer, startTime, endTime });
    offset = end;
  }

  return chunks;
}
