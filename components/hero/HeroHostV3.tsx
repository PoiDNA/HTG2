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
import SilhouetteFigureV3 from './SilhouetteFigureV3';
import FallingFragments from './FallingFragment';
import InnerGlow from './InnerGlow';
import BackgroundCrossfade from './BackgroundCrossfade';
import StatusIcons from './StatusIcons';
import ShimmerEffect from './ShimmerEffect';
import Fireflies from './Fireflies';
import { Z } from './constants';

/**
 * Host v3 Fight & Pain
 * Phase 0: confident strut (walk cycle loop)
 * Phase 0→1: snap dodge left or right (alternating)
 * Phase 1→2: double over in pain (hunch anim)
 * Phase 2→3: stumble/stagger, barely standing
 * Phase 3+: trembling continuously
 * Phase 4: soul — all stops, peaceful breath
 */
export default function HeroHostV3() {
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
  const { activePhaseValue, handleClick, resetToPhase0 } = useHeroPipeline(smoothedProgress, isTouch);
  useAutoRevert(activePhaseValue, isTouch, resetToPhase0);

  // ─── Animation state ─────────────────────────────────────────────
  // idle:     plays continuously (strut / trembling / nothing)
  // reaction: plays once on phase advance, then reverts to idle
  const prevPhaseRef = useRef(0);
  const dodgeRef    = useRef<1 | -1>(1);  // alternates each dodge

  const [idleClass,     setIdleClass]     = useState('v3-strut');
  const [reactionClass, setReactionClass] = useState('');

  const fireReaction = useCallback((cls: string, durationMs: number, afterIdle: string) => {
    setReactionClass(cls);
    setTimeout(() => {
      setReactionClass('');
      setIdleClass(afterIdle);
    }, durationMs);
  }, []);

  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    const current = Math.floor(v);
    const prev    = prevPhaseRef.current;

    // Phase 4 — soul: all motion stops
    if (v >= 3.8) {
      setIdleClass('');
      setReactionClass('');
      prevPhaseRef.current = current;
      return;
    }

    // Phase 0 — restore strut if reverted
    if (v < 0.4 && idleClass !== 'v3-strut') {
      setIdleClass('v3-strut');
      setReactionClass('');
    }

    if (!isTouch && current > prev) {
      if (current === 1) {
        // First hit: dodge left or right
        const dir = dodgeRef.current;
        dodgeRef.current = dir > 0 ? -1 : 1;
        fireReaction(
          dir > 0 ? 'v3-dodge-right' : 'v3-dodge-left',
          650,
          '' // no idle between phases 0→1
        );
      } else if (current === 2) {
        // Second hit: pain hunch
        fireReaction('v3-pain-hunch', 850, 'v3-trembling');
      } else if (current === 3) {
        // Third hit: stagger
        fireReaction('v3-stagger', 950, 'v3-trembling');
      }
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
      heroContainerRef.current.style.overscrollBehaviorY = v <= 0.01 ? 'auto' : 'none';
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

  // ─── Phase 4: click resets ────────────────────────────────────────
  const [phase4, setPhase4] = useState(false);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v >= 3.8) setPhase4(true);
    if (v < 0.5)  setPhase4(false);
  });

  const handleReset = useCallback(() => {
    resetToPhase0({ animated: true });
    setIdleClass('v3-strut');
    setReactionClass('');
    if (isTouch) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetToPhase0, isTouch]);

  // reaction takes priority over idle (both classes animate: last one wins in CSS)
  // To keep it clean: put them on different wrappers
  const figureClass = [idleClass, reactionClass].filter(Boolean).join(' ');

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
            {/* Outer wrapper: idle animation (strut / trembling) */}
            <div
              className={`relative w-full max-w-[500px] aspect-[4/6] ${idleClass}`}
              style={{ willChange: willChangeActive ? 'transform' : 'auto' }}
            >
              {/* Inner wrapper: reaction animation (dodge / hunch / stagger) */}
              <div className={`w-full h-full ${reactionClass}`}
                style={{ position: 'relative' }}>

                <div className="relative w-full h-full" style={{ zIndex: Z.figure }}>
                  <SilhouetteFigureV3
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
              </div>

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
                aria-label="Interactive character"
              />
            </div>
          </div>

          <Fireflies activePhaseValue={activePhaseValue} />
        </div>
      </div>

      <style jsx global>{`
        /* ── STRUT: confident walk cycle (phase 0) ─────────────── */
        @keyframes v3-strut-anim {
          0%   { transform: translate(0,0) rotate(0deg); }
          12%  { transform: translate(5px,-4px) rotate(1.2deg); }
          25%  { transform: translate(7px,-7px) rotate(1.8deg); }
          37%  { transform: translate(3px,-5px) rotate(0.8deg); }
          50%  { transform: translate(-1px,-3px) rotate(-0.3deg); }
          62%  { transform: translate(-6px,-5px) rotate(-1.5deg); }
          75%  { transform: translate(-7px,-7px) rotate(-1.8deg); }
          87%  { transform: translate(-3px,-4px) rotate(-0.8deg); }
          100% { transform: translate(0,0) rotate(0deg); }
        }
        .v3-strut {
          animation: v3-strut-anim 2.8s ease-in-out infinite;
        }

        /* ── DODGE LEFT: sharp sidestep (phase 0→1) ───────────── */
        @keyframes v3-dodge-left-anim {
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          12%  { transform: translate(-48px,-12px) rotate(-7deg) scale(0.95); }
          28%  { transform: translate(-32px,-5px) rotate(-4deg) scale(0.97); }
          48%  { transform: translate(-16px,-1px) rotate(-2deg) scale(0.99); }
          70%  { transform: translate(-6px,0) rotate(-0.8deg); }
          100% { transform: translate(0,0) rotate(0deg) scale(1); }
        }
        .v3-dodge-left {
          animation: v3-dodge-left-anim 0.65s ease-out forwards;
        }

        /* ── DODGE RIGHT ───────────────────────────────────────── */
        @keyframes v3-dodge-right-anim {
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          12%  { transform: translate(48px,-12px) rotate(7deg) scale(0.95); }
          28%  { transform: translate(32px,-5px) rotate(4deg) scale(0.97); }
          48%  { transform: translate(16px,-1px) rotate(2deg) scale(0.99); }
          70%  { transform: translate(6px,0) rotate(0.8deg); }
          100% { transform: translate(0,0) rotate(0deg) scale(1); }
        }
        .v3-dodge-right {
          animation: v3-dodge-right-anim 0.65s ease-out forwards;
        }

        /* ── PAIN HUNCH: doubles over (phase 1→2) ──────────────── */
        @keyframes v3-pain-hunch-anim {
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          10%  { transform: translate(-6px,14px) rotate(6deg) scale(0.97); }
          22%  { transform: translate(-10px,22px) rotate(9deg) scale(0.95); }
          40%  { transform: translate(-8px,18px) rotate(7deg) scale(0.96); }
          58%  { transform: translate(-4px,12px) rotate(5deg) scale(0.97); }
          75%  { transform: translate(-2px,7px) rotate(3deg) scale(0.98); }
          88%  { transform: translate(0,3px) rotate(1deg); }
          100% { transform: translate(0,0) rotate(0deg) scale(1); }
        }
        .v3-pain-hunch {
          animation: v3-pain-hunch-anim 0.85s ease-out forwards;
        }

        /* ── STAGGER: drunk stumble (phase 2→3) ────────────────── */
        @keyframes v3-stagger-anim {
          0%   { transform: translate(0,0) rotate(0deg) scale(1); }
          8%   { transform: translate(-28px,12px) rotate(-8deg) scale(0.93); }
          20%  { transform: translate(22px,20px) rotate(6deg) scale(0.91); }
          34%  { transform: translate(-18px,18px) rotate(-5deg) scale(0.92); }
          50%  { transform: translate(12px,14px) rotate(4deg) scale(0.94); }
          64%  { transform: translate(-8px,10px) rotate(-2.5deg) scale(0.96); }
          78%  { transform: translate(5px,6px) rotate(1.5deg) scale(0.98); }
          90%  { transform: translate(-2px,3px) rotate(-0.5deg); }
          100% { transform: translate(0,0) rotate(0deg) scale(1); }
        }
        .v3-stagger {
          animation: v3-stagger-anim 0.95s ease-out forwards;
        }

        /* ── TREMBLING: continuous pain shudder (phases 2-3) ───── */
        @keyframes v3-trembling-anim {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          10% { transform: translate(-2.5px,1px) rotate(-0.6deg); }
          20% { transform: translate(2px,-1px) rotate(0.5deg); }
          30% { transform: translate(-1.5px,1.5px) rotate(-0.4deg); }
          40% { transform: translate(2px,0.5px) rotate(0.5deg); }
          50% { transform: translate(-1px,-1px) rotate(-0.3deg); }
          60% { transform: translate(1.5px,1px) rotate(0.4deg); }
          70% { transform: translate(-1px,0) rotate(-0.2deg); }
          80% { transform: translate(0.5px,-0.5px) rotate(0.2deg); }
          90% { transform: translate(0,0.5px); }
        }
        .v3-trembling {
          animation: v3-trembling-anim 0.45s ease-in-out infinite;
        }

        /* ── Soul breathe ───────────────────────────────────────── */
        @keyframes hero-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.005); }
        }
      `}</style>
    </LazyMotion>
  );
}
