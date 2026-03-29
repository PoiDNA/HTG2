'use client';

import { Heart } from 'lucide-react';
import { useReaction } from '@/lib/community/hooks/useReaction';

interface ReactionButtonProps {
  targetType: 'post' | 'comment';
  targetId: string;
  initialReacted: boolean;
  initialCount: number;
}

export function ReactionButton({ targetType, targetId, initialReacted, initialCount }: ReactionButtonProps) {
  const { hasReacted, count, toggle, toggling } = useReaction({
    targetType,
    targetId,
    initialReacted,
    initialCount,
  });

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      className={`flex items-center gap-1.5 text-sm transition-colors ${
        hasReacted
          ? 'text-red-500'
          : 'text-htg-fg-muted hover:text-red-500'
      }`}
    >
      <Heart className={`w-4 h-4 ${hasReacted ? 'fill-current' : ''}`} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
