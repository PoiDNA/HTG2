'use client';

import { useCallback } from 'react';
import {
  useMotionValue,
  useMotionValueEvent,
  animate,
  type MotionValue,
} from 'framer-motion';
import { useThrottledClick } from './useThrottledClick';
import { SPRINGS } from './constants';

function mapScrollToPhase(scroll: number): number {
  // Piecewise linear mapping matching SCROLL_BREAKPOINTS → PHASE_VALUES
  if (scroll <= 0.12) return 0;
  if (scroll <= 0.25) return ((scroll - 0.12) / (0.25 - 0.12)) * 1;
  if (scroll <= 0.45) return 1 + ((scroll - 0.25) / (0.45 - 0.25)) * 1;
  if (scroll <= 0.65) return 2 + ((scroll - 0.45) / (0.65 - 0.45)) * 1;
  if (scroll <= 0.85) return 3 + ((scroll - 0.65) / (0.85 - 0.65)) * 1;
  return 4;
}

/**
 * Unified motion pipeline. One MotionValue (activePhaseValue) is the single
 * source of truth. Fed by scroll on touch, by click on non-touch.
 */
export function useHeroPipeline(
  scrollYProgress: MotionValue<number>,
  isTouch: boolean
) {
  const activePhaseValue = useMotionValue(0);

  // Touch: scroll drives the phase
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (isTouch) {
      activePhaseValue.set(mapScrollToPhase(v));
    }
  });

  // Desktop: click advances by 1
  const advancePhase = useCallback(() => {
    if (!isTouch) {
      const current = Math.floor(activePhaseValue.get());
      if (current < 4) {
        animate(activePhaseValue, current + 1, SPRINGS.recoil);
      }
    }
  }, [isTouch, activePhaseValue]);

  const handleClick = useThrottledClick(advancePhase);

  const resetToPhase0 = useCallback(
    (opts?: { animated?: boolean }) => {
      if (opts?.animated === false) {
        activePhaseValue.set(0);
      } else {
        animate(activePhaseValue, 0, SPRINGS.revert);
      }
    },
    [activePhaseValue]
  );

  return { activePhaseValue, handleClick, resetToPhase0 };
}
