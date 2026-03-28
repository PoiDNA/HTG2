'use client';

import { useState, useEffect } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { Z, NUDGE_DELAY_MS } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
  scrollYProgress: MotionValue<number>;
}

/**
 * Mobile only: pulsing chevron ↓ at bottom after 4s of scroll inactivity.
 * Disappears on scroll or at phase 4.
 */
export default function MicroNudge({ activePhaseValue, scrollYProgress }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), NUDGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Hide on any scroll
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (v > 0.05) setVisible(false);
  });

  // Hide at phase 4
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v >= 3.8) setVisible(false);
  });

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:hidden"
      style={{ zIndex: Z.hints }}
    >
      <svg
        width="24" height="24" viewBox="0 0 24 24"
        className="text-white/40"
        style={{ animation: 'nudge-pulse 1.5s ease-in-out infinite' }}
      >
        <polyline
          points="6,9 12,15 18,9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <style jsx>{`
        @keyframes nudge-pulse {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 0.7; transform: translateY(4px); }
        }
      `}</style>
    </div>
  );
}
