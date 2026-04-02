// ---------------------------------------------------------------------------
// Pattern system types for Session Review Player
// ---------------------------------------------------------------------------

/**
 * Audio analysis bands — heuristic energy levels, NOT DSP-grade frequency separation.
 * Band boundaries computed dynamically from analyser.context.sampleRate.
 */
export interface AudioBands {
  /** Low-frequency energy (~20-250 Hz) */
  energy: number;       // 0-1
  /** Mid-frequency energy (~250-2000 Hz) — human voice fundamental */
  midEnergy: number;    // 0-1
  /** High-frequency energy (~2000-8000 Hz) — sibilants, noise */
  highEnergy: number;   // 0-1
  /** Overall RMS energy */
  totalEnergy: number;  // 0-1
  /** True when totalEnergy below silence threshold */
  isSilent: boolean;
}

/** Zeroed-out AudioBands for ambient/static modes */
export const SILENT_BANDS: AudioBands = {
  energy: 0,
  midEnergy: 0,
  highEnergy: 0,
  totalEnergy: 0,
  isSilent: true,
};

/**
 * Rendering context passed to each pattern's render() on every frame.
 */
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  /** Canvas logical width (px, after DPR scaling) */
  width: number;
  /** Canvas logical height (px, after DPR scaling) */
  height: number;
  /** Seconds since animation start (performance.now based). May reset on seek. */
  time: number;
  /** <audio>.currentTime — absolute position in the recording */
  audioTime: number;
  /** Current audio analysis bands */
  audio: AudioBands;
  /** Effective device pixel ratio (after clamping) */
  dpr: number;
  /** Interaction burst intensity (0-1), triggered by click on flower area. Decays over ~1s. */
  interactionBurst: number;
}

/**
 * A generative visual pattern rendered on the MandalaCanvas.
 */
export interface Pattern {
  /** Unique identifier */
  name: string;
  /**
   * Maximum brightness (0-1) for the brightest elements in this pattern.
   * Used to ensure watermark readability. Patterns should clamp their
   * brightest fills/strokes to this value.
   */
  maxBrightness: number;
  /**
   * Render one frame. Must complete within ~4ms to maintain 60fps budget.
   * Called from requestAnimationFrame — no allocations, no DOM reads.
   */
  render(context: RenderContext): void;
}

/** HTG brand color palette for animations */
export const HTG_PALETTE = {
  sage:      '#5A8A4E',
  sageDark:  '#3D6B32',
  indigo:    '#9B4A5C',
  lavender:  '#C8949E',
  cream:     '#FDF5F0',
  warmGold:  '#D4A840',
  deepBg:    '#1A1510',
  honeyGlow: '#FFE4B5',
} as const;
