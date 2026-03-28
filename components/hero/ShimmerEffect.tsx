'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';

interface Props {
  activePhaseValue: MotionValue<number>;
}

/**
 * Shimmer effect on the mask. Mobile: single CSS pseudo-element sweep.
 * Desktop: multi-div approach. Fades out by phase 3.
 */
export default function ShimmerEffect({ activePhaseValue }: Props) {
  const shimmerOpacity = useTransform(activePhaseValue, [0, 2, 3], [0.6, 0.3, 0]);

  return (
    <>
      {/* Mobile: CSS-only shimmer (single pseudo-element) */}
      <m.div
        className="absolute inset-0 pointer-events-none lg:hidden overflow-hidden rounded-lg"
        style={{ opacity: shimmerOpacity, zIndex: 10 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 55%, transparent 60%)',
            animation: 'shimmer-sweep 3s ease-in-out infinite',
            backgroundSize: '200% 100%',
          }}
        />
      </m.div>

      {/* Desktop: multi-div shimmer particles */}
      <m.div
        className="absolute inset-0 pointer-events-none hidden lg:block overflow-hidden rounded-lg"
        style={{ opacity: shimmerOpacity, zIndex: 10 }}
      >
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              left: `${10 + Math.random() * 80}%`,
              top: `${5 + Math.random() * 90}%`,
              backgroundColor: 'rgba(255,255,255,0.4)',
              animation: `shimmer-particle ${2 + Math.random() * 2}s ease-in-out ${Math.random() * 2}s infinite`,
            }}
          />
        ))}
      </m.div>

      <style jsx>{`
        @keyframes shimmer-sweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes shimmer-particle {
          0%, 100% { opacity: 0; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-8px); }
        }
      `}</style>
    </>
  );
}
