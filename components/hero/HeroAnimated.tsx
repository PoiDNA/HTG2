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
import SilhouetteFigureV4 from './SilhouetteFigureV4';
import { useWalkCycle } from './useWalkCycle';
import FallingFragments from './FallingFragment';
import InnerGlow from './InnerGlow';
import BackgroundCrossfade from './BackgroundCrossfade';
import CTABlock from './CTABlock';
import StatusIcons from './StatusIcons';
import ShimmerEffect from './ShimmerEffect';
import Fireflies from './Fireflies';
import OnboardingHint from './OnboardingHint';
import MicroNudge from './MicroNudge';
import { Z } from './constants';

/**
 * Full interactive hero animation — variant A.
 * Desktop: click-driven. Mobile: scroll-driven (sticky in 280svh).
 * Wrapped in LazyMotion + domAnimation. Uses m.* (not motion.*).
 */
export default function HeroAnimated() {
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [isTouch, setIsTouch] = useState(false);

  // useInView — pause all infinite loops when hero leaves viewport
  const isInView = useInView(stickyRef, { once: false, amount: 0.1 });

  // Detect touch device via media query (SSR-safe)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Scroll tracking
  const { scrollYProgress } = useScroll({
    target: heroContainerRef,
    offset: ['start start', 'end end'],
  });

  // Scroll phase (for smoothing)
  const { smoothedProgress } = useScrollPhase(scrollYProgress, isTouch);

  // Unified pipeline
  const { activePhaseValue, handleClick, resetToPhase0 } = useHeroPipeline(
    smoothedProgress,
    isTouch
  );

  // Auto-revert (desktop only)
  useAutoRevert(activePhaseValue, isTouch, resetToPhase0);

  // Skeletal joint system (v4)
  const finalJoints = useWalkCycle(activePhaseValue);

  // Trembling for phases 2-3
  const [trembling, setTrembling] = useState(false);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    setTrembling(v >= 1.8 && v < 3.8);
  });

  // ─── will-change lifecycle ───
  const [willChangeActive, setWillChangeActive] = useState(true);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    // Remove will-change at phase 4 (stop GPU layers)
    setWillChangeActive(v < 3.8);
  });

  // Dynamic overscroll-behavior
  useMotionValueEvent(smoothedProgress, 'change', (v) => {
    if (heroContainerRef.current) {
      heroContainerRef.current.style.overscrollBehaviorY =
        v <= 0.01 ? 'auto' : 'none';
    }
  });

  // BFCache reset
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

  // Orientation change reset
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

  // Reset handler for CTA
  const handleReset = useCallback(() => {
    resetToPhase0({ animated: true });
    if (isTouch) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resetToPhase0, isTouch]);

  // CTA latch state for button pointer-events
  const [ctaLatched, setCtaLatched] = useState(false);
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    if (v >= 3.8) setCtaLatched(true);
    if (v < 0.5) setCtaLatched(false);
  });

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
          {/* Background */}
          <BackgroundCrossfade activePhaseValue={activePhaseValue} />

          {/* Figure container */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`relative w-full max-w-[400px] aspect-[4/6] ${trembling ? 'v4-trembling' : ''}`}
              style={{
                willChange: willChangeActive ? 'transform' : 'auto',
              }}
            >
              {/* SVG figure */}
              <div className="relative w-full h-full" style={{ zIndex: Z.figure }}>
                <SilhouetteFigureV4
                  joints={finalJoints}
                  activePhaseValue={activePhaseValue}
                />
              </div>

              {/* Falling fragments (z above figure) */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="-200 -200 800 1000"
                overflow="visible"
                style={{ zIndex: Z.particles }}
              >
                <FallingFragments activePhaseValue={activePhaseValue} />
              </svg>

              {/* Inner glow (soul head) */}
              <InnerGlow activePhaseValue={activePhaseValue} />

              {/* Shimmer */}
              <ShimmerEffect activePhaseValue={activePhaseValue} />

              {/* Status icons */}
              <StatusIcons activePhaseValue={activePhaseValue} />

              {/* Hit zone button */}
              <button
                onClick={handleClick}
                className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF2D9B]"
                style={{
                  zIndex: Z.hitZone,
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                  pointerEvents: ctaLatched ? 'none' : 'auto',
                }}
                tabIndex={ctaLatched ? -1 : 0}
                aria-label="Uderz w maskę, by odsłonić autentyczną postać"
              />
            </div>
          </div>

          {/* Fireflies */}
          <Fireflies activePhaseValue={activePhaseValue} />

          {/* Onboarding hints */}
          <OnboardingHint activePhaseValue={activePhaseValue} isTouch={isTouch} />

          {/* Micro-nudge (mobile) */}
          <div className="lg:hidden">
            <MicroNudge activePhaseValue={activePhaseValue} scrollYProgress={scrollYProgress} />
          </div>

          {/* CTA — always in DOM */}
          <CTABlock
            activePhaseValue={activePhaseValue}
            scrollYProgress={scrollYProgress}
            isTouch={isTouch}
            onReset={handleReset}
          />
        </div>
      </div>

      {/* Recoil + breathing CSS animations */}
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
          50% { transform: scale(1.005); }
        }
      `}</style>
    </LazyMotion>
  );
}
