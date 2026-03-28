'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';

interface Props {
  activePhaseValue: MotionValue<number>;
}

// Each icon orbits at a different radius, speed, start angle, and depth layer
const ICONS = [
  { emoji: '👑', radius: 160, period: 6,   startDeg: 0,   behind: true,  fadePhase: 2 },
  { emoji: '💎', radius: 200, period: 8,   startDeg: 60,  behind: false, fadePhase: 2 },
  { emoji: '❤️', radius: 140, period: 7,   startDeg: 120, behind: true,  fadePhase: 1 },
  { emoji: '👍', radius: 220, period: 9,   startDeg: 180, behind: false, fadePhase: 1 },
  { emoji: '⭐', radius: 170, period: 5.5, startDeg: 240, behind: true,  fadePhase: 3 },
  { emoji: '🔥', radius: 190, period: 7.5, startDeg: 300, behind: false, fadePhase: 3 },
] as const;

/**
 * Status icons orbiting around the host figure.
 * 4× larger, alternating in front/behind the figure.
 * Each icon fades/explodes at its assigned phase.
 */
export default function StatusIcons({ activePhaseValue }: Props) {
  return (
    <>
      {ICONS.map((icon, i) => (
        <OrbitIcon
          key={i}
          emoji={icon.emoji}
          radius={icon.radius}
          period={icon.period}
          startDeg={icon.startDeg}
          behind={icon.behind}
          fadePhase={icon.fadePhase}
          activePhaseValue={activePhaseValue}
        />
      ))}
      <style jsx global>{`
        @keyframes icon-orbit {
          from { transform: rotate(var(--start-deg)) translateX(var(--orbit-r)) rotate(calc(-1 * var(--start-deg))); }
          to   { transform: rotate(calc(var(--start-deg) + 360deg)) translateX(var(--orbit-r)) rotate(calc(-1 * (var(--start-deg) + 360deg))); }
        }
      `}</style>
    </>
  );
}

function OrbitIcon({
  emoji,
  radius,
  period,
  startDeg,
  behind,
  fadePhase,
  activePhaseValue,
}: {
  emoji: string;
  radius: number;
  period: number;
  startDeg: number;
  behind: boolean;
  fadePhase: number;
  activePhaseValue: MotionValue<number>;
}) {
  const opacity = useTransform(
    activePhaseValue,
    [0, fadePhase - 0.5, fadePhase, fadePhase + 0.3],
    [0.9, 0.9, 0.4, 0]
  );
  const scale = useTransform(
    activePhaseValue,
    [fadePhase - 0.2, fadePhase + 0.3],
    [1, fadePhase === 3 ? 3.5 : 0.3]
  );

  return (
    <m.div
      className="absolute pointer-events-none"
      style={{
        // Center in parent
        left: '50%',
        top: '50%',
        marginLeft: '-2rem',
        marginTop: '-2rem',
        // Orbit animation
        animation: `icon-orbit ${period}s linear infinite`,
        '--orbit-r': `${radius}px`,
        '--start-deg': `${startDeg}deg`,
        // Depth: behind figure (z < 10) or in front (z > 10)
        zIndex: behind ? 5 : 25,
        opacity: opacity as unknown as number,
        scale: scale as unknown as number,
      } as React.CSSProperties}
    >
      <span className="text-7xl block" style={{ filter: behind ? 'brightness(0.7)' : 'none' }}>
        {emoji}
      </span>
    </m.div>
  );
}
