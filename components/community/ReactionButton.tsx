'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';

const REACTION_EMOJIS: Record<string, string> = {
  heart: '❤️',
  thumbs_up: '👍',
  pray: '🙏',
  wow: '😮',
  sad: '😢',
};

interface ReactionButtonProps {
  targetType: 'post' | 'comment';
  targetId: string;
  initialReacted: boolean;
  initialCount: number;
}

export function ReactionButton({ targetType, targetId, initialReacted, initialCount }: ReactionButtonProps) {
  const [hasReacted, setHasReacted] = useState(initialReacted);
  const [count, setCount] = useState(initialCount);
  const [toggling, setToggling] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [currentType, setCurrentType] = useState<string>('heart');
  const pickerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPicker]);

  const sendReaction = useCallback(async (reactionType: string) => {
    if (toggling) return;
    setToggling(true);
    setShowPicker(false);

    const wasReacted = hasReacted;
    const isRemoving = wasReacted && reactionType === currentType;

    // Optimistic update
    setHasReacted(!isRemoving);
    setCount(prev => isRemoving ? Math.max(prev - 1, 0) : (wasReacted ? prev : prev + 1));
    if (!isRemoving) setCurrentType(reactionType);

    try {
      const res = await fetch('/api/community/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reaction_type: reactionType }),
      });

      if (!res.ok) {
        setHasReacted(wasReacted);
        setCount(prev => isRemoving ? prev + 1 : Math.max(prev - 1, 0));
        toast.error('Nie udało się zapisać reakcji');
      }
    } catch {
      setHasReacted(wasReacted);
      setCount(prev => isRemoving ? prev + 1 : Math.max(prev - 1, 0));
      toast.error('Nie udało się zapisać reakcji');
    } finally {
      setToggling(false);
    }
  }, [targetType, targetId, hasReacted, currentType, toggling]);

  const handleClick = () => {
    sendReaction(currentType);
  };

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowPicker(true);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={handleClick}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        disabled={toggling}
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          hasReacted
            ? 'text-red-500'
            : 'text-htg-fg-muted hover:text-red-500'
        }`}
      >
        {hasReacted ? (
          <span className="text-base leading-none">{REACTION_EMOJIS[currentType] || '❤️'}</span>
        ) : (
          <Heart className="w-4 h-4" />
        )}
        {count > 0 && <span>{count}</span>}
      </button>

      {/* Reaction picker (shown on long press) */}
      {showPicker && (
        <div className="absolute bottom-full left-0 mb-2 flex gap-1 bg-htg-card border border-htg-card-border rounded-full px-2 py-1 shadow-lg z-20">
          {Object.entries(REACTION_EMOJIS).map(([type, emoji]) => (
            <button
              key={type}
              onClick={() => sendReaction(type)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-htg-surface transition-colors ${
                hasReacted && currentType === type ? 'bg-htg-sage/10' : ''
              }`}
              title={type}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
