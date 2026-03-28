'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';

interface Props {
  activePhaseValue: MotionValue<number>;
}

const ICONS = [
  { emoji: '👑', x: -120, y: -80, phase: 2 },
  { emoji: '💎', x: 320, y: -60, phase: 2 },
  { emoji: '❤️', x: -100, y: 120, phase: 1 },
  { emoji: '👍', x: 340, y: 140, phase: 1 },
  { emoji: '⭐', x: -80, y: 300, phase: 3 },
  { emoji: '🔥', x: 360, y: 280, phase: 3 },
] as const;

/**
 * Floating status icons around the masked figure.
 * Each fades out at its assigned phase. Explode (scale+opacity) at phase 3.
 */
export default function StatusIcons({ activePhaseValue }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {ICONS.map((icon, i) => (
        <StatusIcon
          key={i}
          emoji={icon.emoji}
          x={icon.x}
          y={icon.y}
          fadePhase={icon.phase}
          activePhaseValue={activePhaseValue}
          index={i}
        />
      ))}
    </div>
  );
}

function StatusIcon({
  emoji,
  x,
  y,
  fadePhase,
  activePhaseValue,
  index,
}: {
  emoji: string;
  x: number;
  y: number;
  fadePhase: number;
  activePhaseValue: MotionValue<number>;
  index: number;
}) {
  const opacity = useTransform(
    activePhaseValue,
    [0, fadePhase - 0.5, fadePhase, fadePhase + 0.3],
    [0.8, 0.8, 0.3, 0]
  );
  const scale = useTransform(
    activePhaseValue,
    [fadePhase - 0.2, fadePhase + 0.3],
    [1, fadePhase === 3 ? 3 : 0.5]
  );

  // Floating animation offset
  const floatX = `calc(50% + ${x}px)`;
  const floatY = `calc(50% + ${y}px)`;

  return (
    <m.span
      className="absolute text-2xl"
      style={{
        left: floatX,
        top: floatY,
        opacity,
        scale,
        animation: `htg-float-${(index % 3) + 1} ${3 + index * 0.5}s ease-in-out infinite`,
      }}
    >
      {emoji}
    </m.span>
  );
}
