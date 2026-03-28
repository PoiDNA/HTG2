'use client';

import { useState, useEffect } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { Z } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
  isTouch: boolean;
}

/**
 * Desktop: pulsing text "Kliknij, by zajrzeć głębiej" — disappears after 1st click.
 * Mobile: animated hand SVG (scroll gesture) — auto-hides after 3s or first scroll.
 */
export default function OnboardingHint({ activePhaseValue, isTouch }: Props) {
  const [visible, setVisible] = useState(true);

  // Hide on first interaction
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v > 0.1) setVisible(false);
  });

  // Mobile: auto-hide after 3s
  useEffect(() => {
    if (!isTouch) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [isTouch]);

  if (!visible) return null;

  if (isTouch) {
    return (
      <div
        className="absolute bottom-16 left-1/2 -translate-x-1/2 lg:hidden"
        style={{ zIndex: Z.hints }}
      >
        <svg
          width="40" height="60" viewBox="0 0 40 60"
          className="animate-bounce text-white/60"
          fill="currentColor"
        >
          {/* Simplified hand scroll gesture */}
          <circle cx="20" cy="15" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="23" x2="20" y2="45" stroke="currentColor" strokeWidth="2" />
          <polyline points="14,38 20,48 26,38" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 hidden lg:block"
      style={{ zIndex: Z.hints }}
    >
      <p
        className="text-white/50 text-sm font-sans tracking-wide"
        style={{ animation: 'pulse-text 2s ease-in-out infinite' }}
      >
        Kliknij, by zajrzeć głębiej
      </p>
      <style jsx>{`
        @keyframes pulse-text {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
