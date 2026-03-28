'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  LazyMotion,
  domAnimation,
  m,
  useScroll,
  useMotionValueEvent,
  useInView,
} from 'framer-motion';
import { useHeroPipeline } from './useHeroPipeline';
import { useScrollPhase } from './useScrollPhase';
import { useAutoRevert } from './useAutoRevert';
import SilhouetteFigureV2 from './SilhouetteFigureV2';
import FallingFragments from './FallingFragment';
import InnerGlow from './InnerGlow';
import BackgroundCrossfade from './BackgroundCrossfade';
import StatusIcons from './StatusIcons';
import ShimmerEffect from './ShimmerEffect';
import Fireflies from './Fireflies';
import { Z } from './constants';

/**
 * Host v2 Move — figure with ego display + defensive movements.
 * Phase 0: looming ego pose, continuous dance animation
 * Phases 1-3: defensive shaking, shrinking, arm-shield
 * Phase 4: calm soul, breathes only
 */
export default function HeroHostV2() {
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [isTouch, setIsTouch] = useState(false);

  const isInView = useInView(stickyRef, { once: false, amount: 0.1 });

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { scrollYProgress } = useScroll({
    target: heroContainerRef,
    offset: ['start start', 'end end'],
  });

  const { smoothedProgress } = useScrollPhase(scrollYProgress, isTouch);

  const { activePhaseValue, handleClick, resetToPhase0 } = useHeroPipeline(
    smoothedProgress,
    isTouch
  );

  useAutoRevert(activePhaseValue, isTouch, resetToPhase0);

  // ─── Phase tracking ─────────────────────────────────────────────
  const prevPhaseRef = useRef(0);
  const [currentPhaseInt, setCurrentPhaseInt] = useState(0);

  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    setCurrentPhaseInt(Math.round(v));
  });

  // ─── Ego dance (phase 0) ─────────────────────────────────────────
  // Active when phase < 0.5
  const [egoDancing, setEgoDancing] = useState(true);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    setEgoDancing(v < 0.5);
  });

  // ─── Defense shake (phases 1-3) — fires on each phase advance ───
  const [defenseClass, setDefenseClass] = useState('');
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    const current = Math.floor(v);
    const prev = prevPhaseRef.current;
    if (!isTouch && current > prev && current >= 1 && current <= 3) {
      setDefenseClass('v2-defense-shake');
      setTimeout(() => setDefenseClass(''), 700);
    }
    prevPhaseRef.current = current;
  });

  // ─── will-change lifecycle ────────────────────────────────────────
  const [willChangeActive, setWillChangeActive] = useState(true);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    setWillChangeActive(v < 3.8);
  });

  // ─── Dynamic overscroll ───────────────────────────────────────────
  useMotionValueEvent(smoothedProgress, 'change', (v) => {
    if (heroContainerRef.current) {
      heroContainerRef.current.style.overscrollBehaviorY =
        v <= 0.01 ? 'auto' : 'none';
    }
  });

  // ─── BFCache reset ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted) {
        resetToPhase0({ animated: false });
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, [resetToPhase0]);

  // ─── Orientation reset ────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      resetToPhase0({ animated: false });
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('orientationchange', handler);
    screen.orientation?.addEventListener('change', handler);
    return () => {
      window.removeEventListener('orientationchange', handler);
      screen.orientation?.removeEventListener('change', handler);
    };
  }, [resetToPhase0]);

  // ─── Phase 4: click resets ─────────────────────────────────────
  const [phase4, setPhase4] = useState(false);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v >= 3.8) setPhase4(true);
    if (v < 0.5)  setPhase4(false);
  });

  const handleReset = useCallback(() => {
    resetToPhase0({ animated: true });
    if (isTouch) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetToPhase0, isTouch]);

  // Combined animation class
  const figureClass = [
    egoDancing ? 'v2-ego-dance' : '',
    defenseClass,
  ].filter(Boolean).join(' ');

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        ref={heroContainerRef}
        className="h-screen max-lg:h-[280svh]"
        style={{
          touchAction: 'pan-y',
          contentVisibility: 'auto',
          containIntrinsicSize: '0 280svh',
        } as React.CSSProperties}
      >
        <div
          ref={stickyRef}
          className="sticky top-0 h-[100svh] lg:relative lg:h-screen overflow-hidden"
          style={{ isolation: 'isolate', colorScheme: 'light' }}
        >
          <BackgroundCrossfade activePhaseValue={activePhaseValue} />

          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`relative w-full max-w-[500px] aspect-[4/6] ${figureClass}`}
              style={{ willChange: willChangeActive ? 'transform' : 'auto' }}
            >
              <div className="relative w-full h-full" style={{ zIndex: Z.figure }}>
                <SilhouetteFigureV2
                  activePhaseValue={activePhaseValue}
                  isInView={isInView}
                />
              </div>

              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="-200 -200 800 1000"
                overflow="visible"
                style={{ zIndex: Z.particles }}
              >
                <FallingFragments activePhaseValue={activePhaseValue} />
              </svg>

              <InnerGlow activePhaseValue={activePhaseValue} />
              <ShimmerEffect activePhaseValue={activePhaseValue} />
              <StatusIcons activePhaseValue={activePhaseValue} />

              {/* Hit zone */}
              <button
                onClick={phase4 ? handleReset : handleClick}
                className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF2D9B]"
                style={{
                  zIndex: Z.hitZone,
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                }}
                tabIndex={0}
                aria-label="Kliknij postać"
              />
            </div>
          </div>

          <Fireflies activePhaseValue={activePhaseValue} />
        </div>
      </div>

      <style jsx global>{`
        /* ─── Ego dance: gentle sway + subtle bob (phase 0) ─── */
        @keyframes v2-ego-dance-anim {
          0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
          12%  { transform: translate(6px, -4px) rotate(1.5deg) scale(1.01); }
          25%  { transform: translate(10px, -8px) rotate(2deg) scale(1.02); }
          37%  { transform: translate(4px, -6px) rotate(0.5deg) scale(1.015); }
          50%  { transform: translate(-2px, -4px) rotate(-1deg) scale(1.01); }
          62%  { transform: translate(-8px, -6px) rotate(-2deg) scale(1.02); }
          75%  { transform: translate(-10px, -8px) rotate(-1.5deg) scale(1.015); }
          87%  { transform: translate(-4px, -4px) rotate(-0.5deg) scale(1.01); }
          100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        }
        .v2-ego-dance {
          animation: v2-ego-dance-anim 3.2s ease-in-out infinite;
        }

        /* ─── Defense shake: sharp recoil + lateral scramble ─── */
        @keyframes v2-defense-shake-anim {
          0%   { transform: translate(0, 0) scale(1); }
          8%   { transform: translate(-14px, 6px) rotate(-3deg) scale(0.97); }
          18%  { transform: translate(12px, -8px) rotate(2.5deg) scale(0.98); }
          30%  { transform: translate(-16px, 4px) rotate(-2deg) scale(0.96); }
          42%  { transform: translate(10px, -5px) rotate(1.5deg) scale(0.97); }
          55%  { transform: translate(-8px, 3px) rotate(-1deg) scale(0.985); }
          68%  { transform: translate(5px, -2px) rotate(0.5deg); }
          80%  { transform: translate(-3px, 1px); }
          100% { transform: translate(0, 0) scale(1); }
        }
        .v2-defense-shake {
          animation: v2-defense-shake-anim 0.7s ease-out;
        }

        /* ─── Breathe (soul, phase 4) ─── */
        @keyframes hero-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.005); }
        }

        /* ─── Neon pulse for ego shimmer (phase 0 mask) ─── */
        @keyframes v2-neon-pulse {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50%       { opacity: 0.85; filter: brightness(1.35) saturate(1.4); }
        }
        .v2-ego-dance svg {
          animation: v2-neon-pulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </LazyMotion>
  );
}
