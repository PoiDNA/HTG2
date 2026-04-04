'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';

const HOVER_LINGER_MS = 3000; // stay visible after mouse leaves

export default function HeaderLogo() {
  const [showTagline, setShowTagline] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Cancel any pending hide
    if (lingerRef.current) {
      clearTimeout(lingerRef.current);
      lingerRef.current = null;
    }
    setShowTagline(true);
  }, [autoPlayed]);

  const handleMouseLeave = useCallback(() => {
    if (autoPlayed) return;
    // Keep visible for a few seconds after leaving
    lingerRef.current = setTimeout(() => {
      setShowTagline(false);
      lingerRef.current = null;
    }, HOVER_LINGER_MS);
  }, [autoPlayed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
  }, []);

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
              className="absolute left-12 whitespace-nowrap pointer-events-none flex items-baseline gap-[0.35em]"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{
                duration: 0.5,
                ease: [0.25, 0.46, 0.45, 0.94],
                exit: { duration: 0.4, ease: 'easeIn' },
              }}
              style={{ willChange: 'opacity, transform' }}
            >
              <span className="text-sm font-serif font-bold tracking-wide text-htg-fg-muted">
                HTG
              </span>
              <span className="text-xs font-sans font-normal tracking-wide text-htg-fg-muted/70">
                — Hacking The Game
              </span>
            </m.span>
          )}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}
