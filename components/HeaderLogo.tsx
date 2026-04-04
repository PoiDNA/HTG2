'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';

const TAGLINE = 'HTG — Hacking The Game';
const STAGGER_DELAY = 0.025; // seconds between each letter

// Per-letter animation variants (GPU-friendly: opacity + transform only)
const letterVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * STAGGER_DELAY,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  exit: (i: number) => ({
    opacity: 0,
    transition: {
      delay: i * 0.01,
      duration: 0.2,
      ease: 'easeIn',
    },
  }),
};

export default function HeaderLogo() {
  const [showTagline, setShowTagline] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);

  // Auto-play on first visit — no delay
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const already = sessionStorage.getItem('htg-tagline-shown');
    if (already) return;

    sessionStorage.setItem('htg-tagline-shown', '1');
    setAutoPlayed(true);
    setShowTagline(true);

    const hideTimer = setTimeout(() => {
      setShowTagline(false);
      setAutoPlayed(false);
    }, 4000);

    return () => clearTimeout(hideTimer);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (autoPlayed) return;
    setShowTagline(true);
  }, [autoPlayed]);

  const handleMouseLeave = useCallback(() => {
    if (!autoPlayed) {
      setShowTagline(false);
    }
  }, [autoPlayed]);

  return (
    <div
      className="flex items-center gap-3 relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Image
        src="/icon.png"
        alt="HTG — Hacking The Game"
        width={36}
        height={36}
        sizes="36px"
        priority
        className="rounded-full transition-transform duration-300 hover:scale-110"
      />
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {showTagline && (
            <m.span
              key="tagline"
              className="absolute left-12 whitespace-nowrap text-xs font-bold font-serif tracking-wide text-htg-fg-muted pointer-events-none flex"
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {TAGLINE.split('').map((char, i) => (
                <m.span
                  key={`${i}-${char}`}
                  custom={i}
                  variants={letterVariants}
                  className={char === ' ' ? 'w-[0.25em]' : undefined}
                  style={{ display: 'inline-block', willChange: 'opacity, transform' }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </m.span>
              ))}
            </m.span>
          )}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}
