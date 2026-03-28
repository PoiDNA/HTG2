'use client';

import { useState, useEffect } from 'react';
import { useMotionValueEvent, m, useTransform, type MotionValue } from 'framer-motion';
import { Z, CTA_UNLATCH_THRESHOLD } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
  scrollYProgress: MotionValue<number>;
  isTouch: boolean;
  onReset: () => void;
}

/**
 * CTA block — ALWAYS in DOM (SSR). CSS-hidden until latch active.
 * No aria-hidden. Pointer-events driven by latch, not by phase.
 */
export default function CTABlock({ activePhaseValue, scrollYProgress, isTouch, onReset }: Props) {
  const [latched, setLatched] = useState(false);

  // Latch when phase reaches 4
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v >= 3.8 && !latched) setLatched(true);
  });

  // Unlatch on conscious scroll retreat (mobile)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (latched && isTouch && v < CTA_UNLATCH_THRESHOLD) setLatched(false);
  });

  // Also unlatch on desktop revert
  useEffect(() => {
    const unsub = activePhaseValue.on('change', (v) => {
      if (v < 0.5 && latched) setLatched(false);
    });
    return unsub;
  }, [activePhaseValue, latched]);

  const ctaOpacity = useTransform(activePhaseValue, [3.5, 4], [0, 1]);

  return (
    <m.div
      className="absolute bottom-8 left-0 right-0 text-center px-6"
      style={{
        zIndex: Z.cta,
        opacity: ctaOpacity,
        pointerEvents: latched ? 'auto' : 'none',
      }}
    >
      <div className="space-y-4">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-bold text-white">
          Spotkajmy się bez masek
        </h2>
        <a
          href="/sesje"
          className="inline-block bg-[#C4956A] hover:bg-[#D4A574] text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors shadow-lg"
          tabIndex={latched ? 0 : -1}
        >
          Poznaj sesje transpersonalne
        </a>
        <div>
          <button
            onClick={onReset}
            className="text-white/60 hover:text-white/90 text-sm transition-colors mt-2"
            tabIndex={latched ? 0 : -1}
          >
            Powtórz doświadczenie
          </button>
        </div>
      </div>
    </m.div>
  );
}
