// ============================================================
// DAW Editor state types and reducer
// ============================================================

/** A region represents a contiguous segment of the original audio buffer */
export interface AudioRegion {
  /** Start offset in the original buffer (in samples) */
  start: number;
  /** End offset in the original buffer (in samples) */
  end: number;
  /** Fade-in duration in samples (from region start) */
  fadeIn: number;
  /** Fade-out duration in samples (from region end) */
  fadeOut: number;
}

export interface DawTrack {
  id: string;
  name: string;
  color: string;
  /** Original decoded audio buffer — immutable */
  audioBuffer: AudioBuffer | null;
  /** Non-destructive edit regions */
  regions: AudioRegion[];
  volume: number;
  mute: boolean;
  solo: boolean;
  /** Pre-computed peak data for waveform drawing (per-channel max values) */
  peaks: Float32Array | null;
}

export interface TimeSelection {
  /** Selection start in seconds */
  start: number;
  /** Selection end in seconds */
  end: number;
}

export interface PlaybackState {
  playing: boolean;
  /** Current position in seconds */
  position: number;
  /** AudioContext.currentTime when playback started */
  startedAt: number;
  /** Position offset when playback started */
  startOffset: number;
}

export interface TrackSnapshot {
  id: string;
  regions: AudioRegion[];
}

export interface EditSnapshot {
  tracks: TrackSnapshot[];
  description: string;
}

export interface DawState {
  tracks: DawTrack[];
  playback: PlaybackState;
  selection: TimeSelection | null;
  zoom: number; // pixels per second
  scrollX: number; // horizontal scroll in pixels
  /** Total duration in seconds (max of all tracks) */
  duration: number;
  masterVolume: number;
  history: EditSnapshot[];
  future: EditSnapshot[];
  activeTool: DawTool;
  loading: boolean;
  saving: boolean;
}

export type DawTool = 'select' | 'cut' | 'fade-in' | 'fade-out' | 'trim';

// Track colors for participants
export const TRACK_COLORS: Record<string, string> = {
  natalia: '#8B9E7C',
  klient: '#CC9544',
  agata: '#6B8A9E',
  justyna: '#9E7C8B',
  default: '#8B7AAF',
};

export function getTrackColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(TRACK_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return TRACK_COLORS.default;
}

// ============================================================
// Actions
// ============================================================

export type DawAction =
  | { type: 'SET_TRACKS'; tracks: DawTrack[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'SET_PLAYBACK'; playback: Partial<PlaybackState> }
  | { type: 'SET_SELECTION'; selection: TimeSelection | null }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_SCROLL_X'; scrollX: number }
  | { type: 'SET_TOOL'; tool: DawTool }
  | { type: 'SET_TRACK_VOLUME'; trackId: string; volume: number }
  | { type: 'SET_TRACK_MUTE'; trackId: string; mute: boolean }
  | { type: 'SET_TRACK_SOLO'; trackId: string; solo: boolean }
  | { type: 'SET_MASTER_VOLUME'; volume: number }
  | { type: 'CUT_SELECTION' }
  | { type: 'DELETE_SELECTION' }
  | { type: 'TRIM_TO_SELECTION' }
  | { type: 'APPLY_FADE_IN' }
  | { type: 'APPLY_FADE_OUT' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ============================================================
// Helpers
// ============================================================

function takeSnapshot(tracks: DawTrack[], description: string): EditSnapshot {
  return {
    tracks: tracks.map((t) => ({
      id: t.id,
      regions: t.regions.map((r) => ({ ...r })),
    })),
    description,
  };
}

function applySnapshot(tracks: DawTrack[], snapshot: EditSnapshot): DawTrack[] {
  return tracks.map((t) => {
    const snap = snapshot.tracks.find((s) => s.id === t.id);
    if (!snap) return t;
    return { ...t, regions: snap.regions.map((r) => ({ ...r })) };
  });
}

/** Convert time (seconds) to sample offset for a given sample rate */
function timeToSamples(time: number, sampleRate: number): number {
  return Math.round(time * sampleRate);
}

/** Calculate the total duration from regions (in seconds) */
function regionsDuration(regions: AudioRegion[], sampleRate: number): number {
  let total = 0;
  for (const r of regions) {
    total += (r.end - r.start) / sampleRate;
  }
  return total;
}

/** Calculate the max duration across all tracks */
function calcDuration(tracks: DawTrack[]): number {
  let max = 0;
  for (const t of tracks) {
    if (!t.audioBuffer) continue;
    const dur = regionsDuration(t.regions, t.audioBuffer.sampleRate);
    if (dur > max) max = dur;
  }
  return max;
}

/**
 * Cut a time range from all tracks' regions.
 * This is the core synchronized cut: cutting [cutStart, cutEnd] seconds
 * removes that segment from every track.
 */
function cutRegions(
  regions: AudioRegion[],
  cutStartSamples: number,
  cutEndSamples: number,
  sampleRate: number
): AudioRegion[] {
  const result: AudioRegion[] = [];
  let cursor = 0; // current position in the virtual timeline (samples)

  for (const region of regions) {
    const regionLen = region.end - region.start;
    const regionStart = cursor;
    const regionEnd = cursor + regionLen;

    if (cutEndSamples <= regionStart || cutStartSamples >= regionEnd) {
      // No overlap — keep entire region
      result.push({ ...region });
    } else {
      // Left part (before cut)
      if (cutStartSamples > regionStart) {
        const leftLen = cutStartSamples - regionStart;
        result.push({
          start: region.start,
          end: region.start + leftLen,
          fadeIn: Math.min(region.fadeIn, leftLen),
          fadeOut: 0,
        });
      }
      // Right part (after cut)
      if (cutEndSamples < regionEnd) {
        const rightOffset = cutEndSamples - regionStart;
        result.push({
          start: region.start + rightOffset,
          end: region.end,
          fadeIn: 0,
          fadeOut: Math.min(region.fadeOut, region.end - (region.start + rightOffset)),
        });
      }
    }
    cursor += regionLen;
  }

  // Suppress lint: sampleRate is used for type safety in future extensions
  void sampleRate;
  return result;
}

/**
 * Delete a time range (replace with silence-equivalent by just removing it).
 * Same as cut for non-destructive editing.
 */
function deleteRegions(
  regions: AudioRegion[],
  delStartSamples: number,
  delEndSamples: number,
  sampleRate: number
): AudioRegion[] {
  return cutRegions(regions, delStartSamples, delEndSamples, sampleRate);
}

/**
 * Trim: keep only the selected time range, remove everything else.
 */
function trimRegions(
  regions: AudioRegion[],
  keepStartSamples: number,
  keepEndSamples: number,
  _sampleRate: number
): AudioRegion[] {
  const result: AudioRegion[] = [];
  let cursor = 0;

  for (const region of regions) {
    const regionLen = region.end - region.start;
    const regionStart = cursor;
    const regionEnd = cursor + regionLen;

    // Overlap with keep range
    const overlapStart = Math.max(regionStart, keepStartSamples);
    const overlapEnd = Math.min(regionEnd, keepEndSamples);

    if (overlapStart < overlapEnd) {
      const offsetStart = overlapStart - regionStart;
      const offsetEnd = overlapEnd - regionStart;
      result.push({
        start: region.start + offsetStart,
        end: region.start + offsetEnd,
        fadeIn: overlapStart === regionStart ? Math.min(region.fadeIn, offsetEnd - offsetStart) : 0,
        fadeOut: overlapEnd === regionEnd ? Math.min(region.fadeOut, offsetEnd - offsetStart) : 0,
      });
    }
    cursor += regionLen;
  }

  return result;
}

/**
 * Apply fade-in to the beginning of a selection.
 */
function applyFadeInToRegions(
  regions: AudioRegion[],
  selStartSamples: number,
  selEndSamples: number,
  _sampleRate: number
): AudioRegion[] {
  const fadeDuration = selEndSamples - selStartSamples;
  const result: AudioRegion[] = [];
  let cursor = 0;

  for (const region of regions) {
    const regionLen = region.end - region.start;
    const regionStart = cursor;
    const regionEnd = cursor + regionLen;

    if (selStartSamples >= regionStart && selStartSamples < regionEnd) {
      const offset = selStartSamples - regionStart;
      const maxFade = Math.min(fadeDuration, regionLen - offset);
      result.push({
        ...region,
        fadeIn: maxFade,
      });
    } else {
      result.push({ ...region });
    }
    cursor += regionLen;
  }

  return result;
}

/**
 * Apply fade-out to the end of a selection.
 */
function applyFadeOutToRegions(
  regions: AudioRegion[],
  selStartSamples: number,
  selEndSamples: number,
  _sampleRate: number
): AudioRegion[] {
  const fadeDuration = selEndSamples - selStartSamples;
  const result: AudioRegion[] = [];
  let cursor = 0;

  for (const region of regions) {
    const regionLen = region.end - region.start;
    const regionStart = cursor;
    const regionEnd = cursor + regionLen;

    if (selEndSamples > regionStart && selEndSamples <= regionEnd) {
      const distFromEnd = regionEnd - selEndSamples;
      void distFromEnd;
      const maxFade = Math.min(fadeDuration, selEndSamples - Math.max(regionStart, selStartSamples));
      result.push({
        ...region,
        fadeOut: maxFade,
      });
    } else {
      result.push({ ...region });
    }
    cursor += regionLen;
  }

  return result;
}

// ============================================================
// Reducer
// ============================================================

export const initialDawState: DawState = {
  tracks: [],
  playback: {
    playing: false,
    position: 0,
    startedAt: 0,
    startOffset: 0,
  },
  selection: null,
  zoom: 50, // 50px per second
  scrollX: 0,
  duration: 0,
  masterVolume: 1,
  history: [],
  future: [],
  activeTool: 'select',
  loading: true,
  saving: false,
};

export function dawReducer(state: DawState, action: DawAction): DawState {
  switch (action.type) {
    case 'SET_TRACKS':
      return {
        ...state,
        tracks: action.tracks,
        duration: calcDuration(action.tracks),
      };

    case 'SET_LOADING':
      return { ...state, loading: action.loading };

    case 'SET_SAVING':
      return { ...state, saving: action.saving };

    case 'SET_PLAYBACK':
      return {
        ...state,
        playback: { ...state.playback, ...action.playback },
      };

    case 'SET_SELECTION':
      return { ...state, selection: action.selection };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(5, Math.min(500, action.zoom)) };

    case 'SET_SCROLL_X':
      return { ...state, scrollX: Math.max(0, action.scrollX) };

    case 'SET_TOOL':
      return { ...state, activeTool: action.tool };

    case 'SET_TRACK_VOLUME':
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, volume: action.volume } : t
        ),
      };

    case 'SET_TRACK_MUTE':
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, mute: action.mute } : t
        ),
      };

    case 'SET_TRACK_SOLO':
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, solo: action.solo } : t
        ),
      };

    case 'SET_MASTER_VOLUME':
      return { ...state, masterVolume: action.volume };

    case 'CUT_SELECTION': {
      if (!state.selection) return state;
      const snapshot = takeSnapshot(state.tracks, 'cut');
      const newTracks = state.tracks.map((t) => {
        if (!t.audioBuffer) return t;
        const sr = t.audioBuffer.sampleRate;
        return {
          ...t,
          regions: cutRegions(
            t.regions,
            timeToSamples(state.selection!.start, sr),
            timeToSamples(state.selection!.end, sr),
            sr
          ),
        };
      });
      return {
        ...state,
        tracks: newTracks,
        duration: calcDuration(newTracks),
        selection: null,
        history: [...state.history, snapshot],
        future: [],
      };
    }

    case 'DELETE_SELECTION': {
      if (!state.selection) return state;
      const snapshot = takeSnapshot(state.tracks, 'delete');
      const newTracks = state.tracks.map((t) => {
        if (!t.audioBuffer) return t;
        const sr = t.audioBuffer.sampleRate;
        return {
          ...t,
          regions: deleteRegions(
            t.regions,
            timeToSamples(state.selection!.start, sr),
            timeToSamples(state.selection!.end, sr),
            sr
          ),
        };
      });
      return {
        ...state,
        tracks: newTracks,
        duration: calcDuration(newTracks),
        selection: null,
        history: [...state.history, snapshot],
        future: [],
      };
    }

    case 'TRIM_TO_SELECTION': {
      if (!state.selection) return state;
      const snapshot = takeSnapshot(state.tracks, 'trim');
      const newTracks = state.tracks.map((t) => {
        if (!t.audioBuffer) return t;
        const sr = t.audioBuffer.sampleRate;
        return {
          ...t,
          regions: trimRegions(
            t.regions,
            timeToSamples(state.selection!.start, sr),
            timeToSamples(state.selection!.end, sr),
            sr
          ),
        };
      });
      return {
        ...state,
        tracks: newTracks,
        duration: calcDuration(newTracks),
        selection: null,
        history: [...state.history, snapshot],
        future: [],
      };
    }

    case 'APPLY_FADE_IN': {
      if (!state.selection) return state;
      const snapshot = takeSnapshot(state.tracks, 'fade-in');
      const newTracks = state.tracks.map((t) => {
        if (!t.audioBuffer) return t;
        const sr = t.audioBuffer.sampleRate;
        return {
          ...t,
          regions: applyFadeInToRegions(
            t.regions,
            timeToSamples(state.selection!.start, sr),
            timeToSamples(state.selection!.end, sr),
            sr
          ),
        };
      });
      return {
        ...state,
        tracks: newTracks,
        history: [...state.history, snapshot],
        future: [],
      };
    }

    case 'APPLY_FADE_OUT': {
      if (!state.selection) return state;
      const snapshot = takeSnapshot(state.tracks, 'fade-out');
      const newTracks = state.tracks.map((t) => {
        if (!t.audioBuffer) return t;
        const sr = t.audioBuffer.sampleRate;
        return {
          ...t,
          regions: applyFadeOutToRegions(
            t.regions,
            timeToSamples(state.selection!.start, sr),
            timeToSamples(state.selection!.end, sr),
            sr
          ),
        };
      });
      return {
        ...state,
        tracks: newTracks,
        history: [...state.history, snapshot],
        future: [],
      };
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const currentSnapshot = takeSnapshot(state.tracks, 'current');
      const prevSnapshot = state.history[state.history.length - 1];
      const newTracks = applySnapshot(state.tracks, prevSnapshot);
      return {
        ...state,
        tracks: newTracks,
        duration: calcDuration(newTracks),
        history: state.history.slice(0, -1),
        future: [currentSnapshot, ...state.future],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const currentSnapshot = takeSnapshot(state.tracks, 'current');
      const nextSnapshot = state.future[0];
      const newTracks = applySnapshot(state.tracks, nextSnapshot);
      return {
        ...state,
        tracks: newTracks,
        duration: calcDuration(newTracks),
        history: [...state.history, currentSnapshot],
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

// ============================================================
// Peak computation for waveforms
// ============================================================

/**
 * Compute peaks from an AudioBuffer for waveform display.
 * Returns downsampled peak data at the given resolution.
 * @param buffer The decoded audio buffer
 * @param targetPeaks Number of peak values to generate
 */
export function computePeaks(buffer: AudioBuffer, targetPeaks: number): Float32Array {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / targetPeaks));
  const peaks = new Float32Array(targetPeaks);

  for (let i = 0; i < targetPeaks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }

  return peaks;
}

/**
 * Build an AudioBuffer from regions (for playback or export).
 */
export function renderRegionsToBuffer(
  originalBuffer: AudioBuffer,
  regions: AudioRegion[],
  audioCtx: BaseAudioContext
): AudioBuffer {
  let totalSamples = 0;
  for (const r of regions) {
    totalSamples += r.end - r.start;
  }

  if (totalSamples === 0) {
    return audioCtx.createBuffer(
      originalBuffer.numberOfChannels,
      1,
      originalBuffer.sampleRate
    );
  }

  const output = audioCtx.createBuffer(
    originalBuffer.numberOfChannels,
    totalSamples,
    originalBuffer.sampleRate
  );

  let writePos = 0;
  for (const region of regions) {
    const len = region.end - region.start;
    for (let ch = 0; ch < originalBuffer.numberOfChannels; ch++) {
      const src = originalBuffer.getChannelData(ch);
      const dst = output.getChannelData(ch);

      for (let i = 0; i < len; i++) {
        let sample = src[region.start + i];

        // Apply fade-in
        if (region.fadeIn > 0 && i < region.fadeIn) {
          sample *= i / region.fadeIn;
        }

        // Apply fade-out
        if (region.fadeOut > 0 && i >= len - region.fadeOut) {
          const fadePos = i - (len - region.fadeOut);
          sample *= 1 - fadePos / region.fadeOut;
        }

        dst[writePos + i] = sample;
      }
    }
    writePos += len;
  }

  return output;
}
