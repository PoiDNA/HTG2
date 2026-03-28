'use client';

import { useTransform, useSpring, type MotionValue } from 'framer-motion';
import { SCROLL_BREAKPOINTS, PHASE_VALUES } from './constants';

/**
 * Maps scrollYProgress to a continuous phase value (0–4).
 * Touch: virtually linear (no input lag).
 * Non-touch (keyboard/wheel): spring-smoothed.
 */
export function useScrollPhase(
  scrollYProgress: MotionValue<number>,
  isTouch: boolean
) {
  const smoothedProgress = useSpring(
    scrollYProgress,
    isTouch
      ? { stiffness: 10000, damping: 1000, restDelta: 0.0001 }
      : { stiffness: 400, damping: 90, restDelta: 0.001 }
  );

  const phase = useTransform(
    smoothedProgress,
    [...SCROLL_BREAKPOINTS],
    [...PHASE_VALUES]
  );

  return { smoothedProgress, phase };
}
