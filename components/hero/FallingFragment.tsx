'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { FRAGMENT_SCHEDULE, MASK_COLORS } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
}

interface FragmentConfig {
  id: string;
  /** Phase at which this fragment detaches */
  detachPhase: 1 | 2 | 3;
  /** Starting position (center of geometry piece) */
  cx: number;
  cy: number;
  /** Size of fragment shard */
  points: string;
  /** Neon fill color */
  fill: string;
}

// Build config from schedule
const FRAGMENTS: FragmentConfig[] = [];

const PIECE_CENTERS: Record<string, [number, number]> = {
  'chest-upper':    [200, 110],
  'shoulder-left':  [130, 90],
  'shoulder-right': [270, 90],
  'arm-left':       [100, 210],
  'arm-right':      [300, 210],
  'chest-lower':    [200, 220],
  'hip-left':       [175, 330],
  'hip-right':      [225, 330],
  'visor':          [200, -40],
  'head-left':      [170, -50],
  'head-right':     [230, -50],
  'leg-left':       [160, 475],
  'leg-right':      [240, 475],
};

const COLORS = [MASK_COLORS.primary, MASK_COLORS.secondary, MASK_COLORS.tertiary];

(Object.entries(FRAGMENT_SCHEDULE) as [string, string[]][]).forEach(([phase, ids]) => {
  ids.forEach((id, i) => {
    const [cx, cy] = PIECE_CENTERS[id] || [200, 300];
    FRAGMENTS.push({
      id,
      detachPhase: Number(phase) as 1 | 2 | 3,
      cx, cy,
      points: generateShardPoints(cx, cy, 15 + Math.random() * 10),
      fill: COLORS[i % COLORS.length],
    });
  });
});

function generateShardPoints(cx: number, cy: number, size: number): string {
  // Random angular shard shape
  const n = 4 + Math.floor(Math.random() * 3);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const r = size * (0.6 + Math.random() * 0.4);
    pts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
  }
  return pts.join(' ');
}

/**
 * Falling armor fragments. Each detaches at its assigned phase,
 * falls downward with spring physics, rotates, and fades out.
 */
export default function FallingFragments({ activePhaseValue }: Props) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {FRAGMENTS.map((frag) => (
        <Fragment key={frag.id} config={frag} activePhaseValue={activePhaseValue} />
      ))}
    </g>
  );
}

function Fragment({
  config,
  activePhaseValue,
}: {
  config: FragmentConfig;
  activePhaseValue: MotionValue<number>;
}) {
  const { detachPhase, cx, cy, points, fill } = config;

  // Fragment becomes visible just before detach, then falls
  const startPhase = detachPhase - 0.1;
  const endPhase = detachPhase + 0.8;

  const opacity = useTransform(
    activePhaseValue,
    [startPhase, detachPhase, detachPhase + 0.1, endPhase],
    [0, 1, 0.8, 0]
  );

  // Fall distance: 0 → 200-400px downward
  const fallDistance = 200 + Math.random() * 200;
  const translateY = useTransform(
    activePhaseValue,
    [startPhase, detachPhase, endPhase],
    [0, 0, fallDistance]
  );

  // Lateral drift
  const lateralDrift = (cx > 200 ? 1 : -1) * (30 + Math.random() * 60);
  const translateX = useTransform(
    activePhaseValue,
    [startPhase, detachPhase, endPhase],
    [0, 0, lateralDrift]
  );

  // Rotation during fall
  const rotation = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 90);
  const rotate = useTransform(
    activePhaseValue,
    [startPhase, detachPhase, endPhase],
    [0, 0, rotation]
  );

  const scale = useTransform(
    activePhaseValue,
    [detachPhase, endPhase],
    [1, 0.5]
  );

  return (
    <m.polygon
      points={points}
      fill={fill}
      style={{
        opacity,
        translateX,
        translateY,
        rotate,
        scale,
        transformOrigin: `${cx}px ${cy}px`,
        willChange: 'transform, opacity',
      }}
    />
  );
}
