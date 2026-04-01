// ---------------------------------------------------------------------------
// Animation Timeline — Etap 2 type scaffolding (booking-recordings-only)
//
// Discriminated union per pattern with typed params.
// Validation is MANDATORY at timeline ingestion, not just in the renderer.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pattern-specific params (must match patterns available in Etap 1)
// ---------------------------------------------------------------------------

export interface MandalaParams {
  folds: number;           // 4-16
  layers: number;          // 1-8
  rotationSpeed: number;   // 0-2
}

export interface ConcentricParams {
  ringCount: number;       // 4-20
  spacing: number;         // 0.5-3
}

// ---------------------------------------------------------------------------
// Pattern config — discriminated union
// ---------------------------------------------------------------------------

export type PatternConfig =
  | { pattern: 'mandala'; params: MandalaParams }
  | { pattern: 'concentric'; params: ConcentricParams };

// ---------------------------------------------------------------------------
// Timeline segments
// ---------------------------------------------------------------------------

export interface AnimationSegment {
  id: string;
  /** Start time in seconds (relative to recording start) */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Pattern configuration — typed per pattern */
  config: PatternConfig;
  /** Transition type (only those the renderer can stably execute) */
  transition: 'crossfade' | 'cut';
  /** Transition duration in seconds (ignored for 'cut') */
  transitionDuration: number;
}

// ---------------------------------------------------------------------------
// Full timeline
// ---------------------------------------------------------------------------

export interface AnimationTimeline {
  /** Schema version for future migrations */
  schemaVersion: 1;
  /** Booking recording ID — this system is booking-recordings-only */
  recordingId: string;
  /** Ordered list of animation segments */
  segments: AnimationSegment[];
  /** ISO timestamp when this timeline was generated */
  generatedAt: string;
  /** AI model identifier that generated this timeline */
  modelId: string;
}

// ---------------------------------------------------------------------------
// Validation (mandatory at ingestion)
// ---------------------------------------------------------------------------

const KNOWN_PATTERNS = new Set(['mandala', 'concentric']);

const PARAM_RANGES: Record<string, Record<string, [number, number]>> = {
  mandala: {
    folds: [4, 16],
    layers: [1, 8],
    rotationSpeed: [0, 2],
  },
  concentric: {
    ringCount: [4, 20],
    spacing: [0.5, 3],
  },
};

export interface ValidationError {
  segmentId: string;
  field: string;
  message: string;
}

/**
 * Validate an AnimationTimeline at ingestion.
 * Returns empty array if valid, otherwise list of errors.
 */
export function validateTimeline(timeline: AnimationTimeline): ValidationError[] {
  const errors: ValidationError[] = [];

  if (timeline.schemaVersion !== 1) {
    errors.push({ segmentId: '', field: 'schemaVersion', message: `Unknown schema version: ${timeline.schemaVersion}` });
  }

  for (const seg of timeline.segments) {
    if (seg.startTime < 0 || seg.endTime <= seg.startTime) {
      errors.push({ segmentId: seg.id, field: 'time', message: `Invalid time range: ${seg.startTime}-${seg.endTime}` });
    }

    if (!KNOWN_PATTERNS.has(seg.config.pattern)) {
      errors.push({ segmentId: seg.id, field: 'pattern', message: `Unknown pattern: ${seg.config.pattern}` });
      continue;
    }

    const ranges = PARAM_RANGES[seg.config.pattern];
    if (ranges) {
      for (const [key, [min, max]] of Object.entries(ranges)) {
        const value = (seg.config.params as unknown as Record<string, number>)[key];
        if (value == null || value < min || value > max) {
          errors.push({
            segmentId: seg.id,
            field: `params.${key}`,
            message: `${key} = ${value} out of range [${min}, ${max}]`,
          });
        }
      }
    }

    if (seg.transition !== 'crossfade' && seg.transition !== 'cut') {
      errors.push({ segmentId: seg.id, field: 'transition', message: `Unknown transition: ${seg.transition}` });
    }
  }

  return errors;
}
