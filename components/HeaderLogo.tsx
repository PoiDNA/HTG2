'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';

export default function HeaderLogo() {
  const [showTagline, setShowTagline] = useState(false);

  useEffect(() => {
    // Respect reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    // Only show tagline once per browser session
    const already = sessionStorage.getItem('htg-tagline-shown');
    if (already) return;

    const showTimer = setTimeout(() => setShowTagline(true), 2000);
    const hideTimer = setTimeout(() => {
      setShowTagline(false);
      // Mark as shown only after animation completes
      sessionStorage.setItem('htg-tagline-shown', '1');
    }, 6000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 relative">
      <Image
        src="/icon.png"
        alt="HTG — Hacking The Game"
        width={36}
        height={36}
        sizes="36px"
        priority
        className="rounded-full"
      />
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {showTagline && (
            <m.span
              key="tagline"
              initial={{ opacity: 0, x: -12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 4, filter: 'blur(6px)' }}
              transition={{
                duration: 1.0,
                ease: [0.25, 0.46, 0.45, 0.94],
                exit: { duration: 1.2, ease: [0.55, 0.06, 0.68, 0.19] },
              }}
              className="absolute left-12 whitespace-nowrap text-base font-serif tracking-wide text-htg-fg pointer-events-none"
            >
              HTG — Hacking The Game
            </m.span>
          )}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}
