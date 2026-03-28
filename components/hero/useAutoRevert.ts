'use client';

import { useEffect, useRef } from 'react';
import { type MotionValue, useMotionValueEvent } from 'framer-motion';
import { AUTO_REVERT_MS } from './constants';

/**
 * Auto-reverts to phase 0 after 10s of inactivity in phases 1–3 (desktop only).
 * Respects Page Visibility API: pauses when tab hidden, instant revert if >10s elapsed.
 */
export function useAutoRevert(
  activePhaseValue: MotionValue<number>,
  isTouch: boolean,
  resetToPhase0: (opts?: { animated?: boolean }) => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  // Track phase changes
  useMotionValueEvent(activePhaseValue, 'change', (v) => {
    phaseRef.current = v;
  });

  useEffect(() => {
    if (isTouch) return;

    function clearTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function startTimer() {
      clearTimer();
      const phase = Math.floor(phaseRef.current);
      if (phase >= 1 && phase <= 3) {
        timerRef.current = setTimeout(() => {
          resetToPhase0({ animated: true });
        }, AUTO_REVERT_MS);
      }
    }

    // Listen for phase changes
    const unsub = activePhaseValue.on('change', (v) => {
      const phase = Math.floor(v);
      if (phase >= 1 && phase <= 3) {
        startTimer();
      } else {
        clearTimer();
      }
    });

    // Page Visibility
    function handleVisibility() {
      if (document.hidden) {
        clearTimer();
        hiddenAtRef.current = Date.now();
      } else {
        const elapsed = hiddenAtRef.current
          ? Date.now() - hiddenAtRef.current
          : 0;
        hiddenAtRef.current = null;
        const phase = Math.floor(phaseRef.current);
        if (phase >= 1 && phase <= 3 && elapsed > AUTO_REVERT_MS) {
          resetToPhase0({ animated: false });
        } else if (phase >= 1 && phase <= 3) {
          startTimer();
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearTimer();
      unsub();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isTouch, activePhaseValue, resetToPhase0]);
}
