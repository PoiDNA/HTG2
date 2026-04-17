'use client';

import { useEffect, useState } from 'react';
import { Play, Pause, X, Bookmark, Zap, Mic } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';

/**
 * FragmentMiniPlayer — sticky bottom bar shown when fragment playback is active.
 *
 * Reads from PlayerContext; the actual audio is driven by GlobalPlayer.
 * Renders only when activePlayback.kind is a fragment variant or impulse.
 */
export default function FragmentMiniPlayer() {
  const { activePlayback, playerState, engineHandle, stopPlayback } = usePlayer();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  const isFragment =
    activePlayback?.kind === 'fragment_review' ||
    activePlayback?.kind === 'fragment_radio' ||
    activePlayback?.kind === 'fragment_recording_review' ||
    activePlayback?.kind === 'impulse';

  // Subscribe to time/duration via engine handle
  useEffect(() => {
    if (!engineHandle || !isFragment) return;
    const unsubTime = engineHandle.subscribeToTime(setCurrentTime);
    const unsubDur = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubTime(); unsubDur(); };
  }, [engineHandle, isFragment]);

  if (!isFragment || !activePlayback) return null;

  const isPlaying = playerState.status === 'playing';
  const isLoading = playerState.status === 'loading' || playerState.status === 'refreshing';

  // Derive display info
  const startSec = 'startSec' in activePlayback ? activePlayback.startSec : 0;
  const endSec = 'endSec' in activePlayback ? activePlayback.endSec : 0;
  const fragmentRange = endSec - startSec;
  const fragmentElapsed = Math.max(0, Math.min(currentTime - startSec, fragmentRange));
  const progress = fragmentRange > 0 ? (fragmentElapsed / fragmentRange) * 100 : 0;

  const title = 'fragmentTitle' in activePlayback && activePlayback.fragmentTitle
    ? activePlayback.fragmentTitle
    : activePlayback.title;

  const sessionTitle = activePlayback.title !== title ? activePlayback.title : undefined;

  const Icon =
    activePlayback.kind === 'impulse'
      ? Zap
      : activePlayback.kind === 'fragment_recording_review'
      ? Mic
      : Bookmark;

  const iconColor =
    activePlayback.kind === 'impulse'
      ? 'text-amber-400'
      : activePlayback.kind === 'fragment_recording_review'
      ? 'text-htg-lavender'
      : 'text-htg-sage';

  const handlePlayPause = () => {
    if (!engineHandle) return;
    if (isPlaying) {
      engineHandle.pause();
    } else {
      engineHandle.play();
    }
  };

  const handleStop = () => {
    stopPlayback();
  };

  // Format elapsed/total
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-xl mx-auto
                    bg-[#0D1A12]/95 backdrop-blur-md rounded-2xl border border-white/10
                    shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <div
          className="h-full bg-htg-sage transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 shrink-0 ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Title area */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{title}</p>
          {sessionTitle && (
            <p className="text-white/50 text-xs truncate">{sessionTitle}</p>
          )}
        </div>

        {/* Time */}
        <div className="text-white/40 text-xs font-mono shrink-0">
          {fmtTime(fragmentElapsed)}/{fmtTime(fragmentRange)}
        </div>

        {/* Play/pause */}
        <button
          onClick={handlePlayPause}
          disabled={isLoading}
          className="w-9 h-9 flex items-center justify-center rounded-full
                     bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
        >
          {isLoading ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-htg-sage border-t-transparent animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Stop/close */}
        <button
          onClick={handleStop}
          className="w-8 h-8 flex items-center justify-center rounded-full
                     text-white/30 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          aria-label="Zatrzymaj"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
