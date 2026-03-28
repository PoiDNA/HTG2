'use client';

import { useTransform, m, type MotionValue, useInView } from 'framer-motion';
import { useRef, useMemo } from 'react';
import { SOUL_COLORS, PARTICLE_COUNTS, Z } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
}

export default function Fireflies({ activePhaseValue }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false });
  const opacity = useTransform(activePhaseValue, [3, 4], [0, 1]);

  // Generate firefly configs once
  const flies = useMemo(() => {
    const count = PARTICLE_COUNTS.fireflies.desktop; // max, CSS hides extras
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      duration: 4 + Math.random() * 6,
      delay: Math.random() * 4,
      opacityRange: [0.2, 0.3 + Math.random() * 0.2],
    }));
  }, []);

  return (
    <m.div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity, zIndex: Z.figure, mixBlendMode: 'screen' }}
    >
      {isInView &&
        flies.map((fly) => (
          <div
            key={fly.id}
            className={`absolute rounded-full ${
              fly.id >= PARTICLE_COUNTS.fireflies.mobile
                ? fly.id >= PARTICLE_COUNTS.fireflies.tablet
                  ? 'hidden lg:block'
                  : 'hidden md:block'
                : ''
            }`}
            style={{
              left: `${fly.x}%`,
              top: `${fly.y}%`,
              width: fly.size,
              height: fly.size,
              backgroundColor: SOUL_COLORS.firefly,
              animation: `firefly-drift ${fly.duration}s ease-in-out ${fly.delay}s infinite`,
              mixBlendMode: 'screen',
            }}
          />
        ))}
      <style jsx>{`
        @keyframes firefly-drift {
          0%, 100% {
            opacity: 0.2;
            transform: translate(0, 0);
          }
          25% {
            opacity: 0.5;
            transform: translate(${8}px, -${12}px);
          }
          50% {
            opacity: 0.3;
            transform: translate(-${6}px, ${8}px);
          }
          75% {
            opacity: 0.45;
            transform: translate(${10}px, ${5}px);
          }
        }
      `}</style>
    </m.div>
  );
}
