'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseReactionOptions {
  targetType: 'post' | 'comment';
  targetId: string;
  initialReacted: boolean;
  initialCount: number;
}

/**
 * Hook for optimistic reaction toggle.
 * Updates UI immediately, then syncs with server.
 */
export function useReaction({
  targetType,
  targetId,
  initialReacted,
  initialCount,
}: UseReactionOptions) {
  const [hasReacted, setHasReacted] = useState(initialReacted);
  const [count, setCount] = useState(initialCount);
  const [toggling, setToggling] = useState(false);

  const toggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);

    // Optimistic update
    const wasReacted = hasReacted;
    setHasReacted(!wasReacted);
    setCount(prev => wasReacted ? Math.max(prev - 1, 0) : prev + 1);

    try {
      const res = await fetch('/api/community/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });

      if (!res.ok) {
        setHasReacted(wasReacted);
        setCount(prev => wasReacted ? prev + 1 : Math.max(prev - 1, 0));
        toast.error('Nie udało się zapisać reakcji');
      }
    } catch {
      setHasReacted(wasReacted);
      setCount(prev => wasReacted ? prev + 1 : Math.max(prev - 1, 0));
      toast.error('Nie udało się zapisać reakcji');
    } finally {
      setToggling(false);
    }
  }, [targetType, targetId, hasReacted, toggling]);

  return { hasReacted, count, toggle, toggling };
}
