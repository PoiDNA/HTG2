'use client';

import { useRef, useCallback } from 'react';
import { THROTTLE_MS } from './constants';

export function useThrottledClick(handler: () => void) {
  const lastClickRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastClickRef.current < THROTTLE_MS) return;
    lastClickRef.current = now;
    handler();
  }, [handler]);
}
