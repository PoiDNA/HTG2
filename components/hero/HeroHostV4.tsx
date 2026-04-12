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
import { useWalkCycle } from './useWalkCycle';
import SilhouetteFigureV4 from './SilhouetteFigureV4';
import FallingFragments from './FallingFragment';
import InnerGlow from './InnerGlow';
import BackgroundCrossfade from './BackgroundCrossfade';
import StatusIcons from './StatusIcons';
import ShimmerEffect from './ShimmerEffect';
import Fireflies from './Fireflies';
import { Z } from './constants';

/**
 * Host v4 — Skeletal figure with Forward Kinematics.
 * Walk cycle (phase 0), dodge/pain/collapse (phases 1-3), soul (phase 4).
 * All joint angles computed once via useWalkCycle, shared across 3 render layers.
 */
export default function HeroHostV4() {
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

  // ─── Skeletal joint system ────────────────────────────────────────
  const finalJoints = useWalkCycle(activePhaseValue);

  // ─── Trembling (CSS micro-shake for phases 2-3) ───────────────────
  const [trembling, setTrembling] = useState(false);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    setTrembling(v >= 1.8 && v < 3.8);
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
    if (v < 0.5) setPhase4(false);
  });

  const handleReset = useCallback(() => {
    resetToPhase0({ animated: true });
    if (isTouch) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetToPhase0, isTouch]);

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
              className={`relative w-full max-w-[500px] aspect-[4/6] ${trembling ? 'v4-trembling' : ''}`}
              style={{ willChange: willChangeActive ? 'transform' : 'auto' }}
            >
              <div className="relative w-full h-full" style={{ zIndex: Z.figure }}>
                <SilhouetteFigureV4
                  joints={finalJoints}
                  activePhaseValue={activePhaseValue}
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
        @keyframes v4-trembling-anim {
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
        .v4-trembling {
          animation: v4-trembling-anim 0.45s ease-in-out infinite;
        }
        @keyframes hero-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.005); }
        }
      `}</style>
    </LazyMotion>
  );
}
