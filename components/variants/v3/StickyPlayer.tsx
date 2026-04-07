'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, X } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';

/**
 * V3 "Sanctum" Sticky Player — conditional bottom bar.
 * Shows only when there's an active session. Persists across pages.
 * Mini progress bar (not waveform). Click title to scroll to content.
 */
export default function StickyPlayer() {
  const { activeSession, playerState, engineHandle, stopPlayback } = usePlayer();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  // Subscribe to time updates
  useEffect(() => {
    if (!engineHandle) return;
    const unsubTime = engineHandle.subscribeToTime(setCurrentTime);
    const unsubDur = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubTime(); unsubDur(); };
  }, [engineHandle]);

  const handlePlayPause = useCallback(() => {
    if (!engineHandle) return;
    const snap = engineHandle.getSnapshot();
    if (snap.paused) {
      engineHandle.play();
    } else {
      engineHandle.pause();
    }
  }, [engineHandle]);

  // Don't show if no active session
  if (!activeSession) return null;

  // Ended state — show "Sesja zakończona" briefly
  if (playerState.status === 'ended') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-lg">
        <div className="h-0.5 bg-htg-warm w-full" />
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-htg-fg-muted">Sesja zakończona.</p>
          <button
            onClick={stopPlayback}
            className="px-4 py-2 rounded-lg text-xs font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
          >
            Wróć do panelu
          </button>
        </div>
      </div>
    );
  }

  const isPlaying = playerState.status === 'playing';
  const progress = duration ? (currentTime / duration) * 100 : 0;

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-lg">
      {/* Progress bar — thin line on top of the bar */}
      <div className="h-0.5 bg-htg-surface">
        <div
          className="h-full bg-htg-warm transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-htg-warm/10 hover:bg-htg-warm/20 text-htg-warm transition-colors shrink-0"
          aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Title + time */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-htg-fg truncate">
            {activeSession.title}
          </p>
          <p className="text-xs text-htg-fg-muted">
            {formatTime(currentTime)}
            {duration ? ` / ${formatTime(duration)}` : ''}
          </p>
        </div>

        {/* Close */}
        <button
          onClick={stopPlayback}
          className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors shrink-0"
          aria-label="Zamknij odtwarzacz"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
