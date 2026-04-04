'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';

export default function HeaderLogo() {
  const [showTagline, setShowTagline] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);

  useEffect(() => {
    // Respect reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    // Only show tagline once per browser session (auto-play)
    const already = sessionStorage.getItem('htg-tagline-shown');
    if (already) return;

    sessionStorage.setItem('htg-tagline-shown', '1');
    setAutoPlayed(true);

    const showTimer = setTimeout(() => setShowTagline(true), 2000);
    const hideTimer = setTimeout(() => {
      setShowTagline(false);
      setAutoPlayed(false);
    }, 6000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (autoPlayed) return; // Don't interfere with auto-play
    setIsHovered(true);
    setShowTagline(true);
  }, [autoPlayed]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
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
              initial={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{
                duration: isHovered ? 0.5 : 0.8,
                ease: [0.25, 0.46, 0.45, 0.94],
                exit: { duration: 0.6, ease: [0.55, 0.06, 0.68, 0.19] },
              }}
              className="absolute left-12 whitespace-nowrap text-sm font-serif tracking-wide text-htg-fg-muted pointer-events-none"
            >
              HTG — Hacking The Game
            </m.span>
          )}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}
