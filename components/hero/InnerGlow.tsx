'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { SOUL_COLORS } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
}

/**
 * Pulsating inner glow on the soul's face.
 * CSS radial-gradient fallback (works without AVIF/WebP assets).
 * When production assets are ready, swap div for <picture> element.
 * Animated opacity 0.3–0.6, scale 1.0–1.1, 3s cycle.
 */
export default function InnerGlow({ activePhaseValue }: Props) {
  const glowOpacity = useTransform(activePhaseValue, [3, 4], [0, 1]);

  return (
    <m.div
      className="absolute pointer-events-none"
      style={{
        opacity: glowOpacity,
        top: '22%',
        left: '50%',
        transform: 'translate(-50%, -50%) translateZ(0)',
        width: 80,
        height: 80,
        zIndex: 10,
        mixBlendMode: 'screen',
      }}
    >
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `radial-gradient(circle, ${SOUL_COLORS.glowStrong}CC 0%, ${SOUL_COLORS.glow}80 30%, ${SOUL_COLORS.glowStrong}26 70%, transparent 100%)`,
          animation: 'inner-glow-pulse 3s ease-in-out infinite',
        }}
      />

      <style jsx>{`
        @keyframes inner-glow-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1.0); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      `}</style>
    </m.div>
  );
}
