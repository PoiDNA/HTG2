// ---------------------------------------------------------------------------
// createPlaybackAudioGraph — best-effort Web Audio API graph with analyser
//
// Creates an audio processing chain that routes playback through an
// AnalyserNode for FFT data. This is an OPTIONAL layer — if it fails
// (no AudioContext, CORS, iOS pre-gesture), playback continues without
// analysis and the canvas falls back to ambient-mode animations.
//
// This does NOT block heartbeat, play-event, play-position, or token refresh.
// ---------------------------------------------------------------------------

export interface PlaybackAudioGraph {
  analyser: AnalyserNode;
  audioContext: AudioContext;
  cleanup: () => void;
}

/**
 * Best-effort audio graph creation.
 * Returns null if the graph cannot be created — playback must continue regardless.
 *
 * @param audioEl - The hidden <audio> element. Must have crossOrigin="anonymous".
 *                  Deliberately typed as HTMLAudioElement (audio-first V1 scope).
 */
export function createPlaybackAudioGraph(
  audioEl: HTMLAudioElement,
): PlaybackAudioGraph | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();

    // Create source from audio element
    const source = ctx.createMediaElementSource(audioEl);

    // Gain node (transparent — 1:1, no degradation)
    const gain = ctx.createGain();
    gain.gain.value = 1.0;

    // Dynamics compressor (transparent settings — 1:1 ratio)
    // Routes audio through Web Audio API chain, making loopback capture harder
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(1, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    // Analyser for FFT data — high resolution for meaningful bass separation
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // 1024 bins, ~21 Hz/bin at 44.1kHz
    analyser.smoothingTimeConstant = 0.8;

    // Channel splitter/merger for stereo processing
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Wire the chain: source → gain → compressor → splitter → merger → analyser → destination
    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    merger.connect(analyser);
    analyser.connect(ctx.destination);

    const cleanup = () => {
      try {
        source.disconnect();
        gain.disconnect();
        compressor.disconnect();
        splitter.disconnect();
        merger.disconnect();
        analyser.disconnect();
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        // Nodes may already be disconnected
      }
    };

    return { analyser, audioContext: ctx, cleanup };
  } catch {
    // Any failure — return null, playback continues without analysis
    return null;
  }
}
