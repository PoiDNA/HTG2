'use client';

// ---------------------------------------------------------------------------
// PlayerControls — custom audio controls with a11y
//
// Updates via subscribeToTime (immediate + post-action), NOT rAF.
// Drag: pointer state + commit on release, no rAF in controls.
// Volume: capability-driven (canSetVolume), not platform guess.
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { AudioEngineHandle, PlayerState } from './AudioEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerControlsProps {
  engineHandle: AudioEngineHandle | null;
  playerState: PlayerState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerControls({ engineHandle, playerState }: PlayerControlsProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  const seekbarRef = useRef<HTMLInputElement>(null);

  const status = playerState.status;
  const isPlaying = status === 'playing';
  const isEnded = status === 'ended';
  const canInteract = isPlaying || status === 'paused' || isEnded || status === 'refreshing';

  // -------------------------------------------------------------------------
  // Subscriptions (immediate emit)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!engineHandle) return;
    const unsubTime = engineHandle.subscribeToTime((t) => {
      if (!isDragging) setCurrentTime(t);
    });
    const unsubDur = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubTime(); unsubDur(); };
  }, [engineHandle, isDragging]);

  // -------------------------------------------------------------------------
  // Play / Pause / Replay
  // -------------------------------------------------------------------------
  const handlePlayPause = useCallback(() => {
    if (!engineHandle) return;
    if (isEnded) {
      engineHandle.seek(0);
      engineHandle.play();
    } else if (isPlaying) {
      engineHandle.pause();
    } else {
      engineHandle.play();
    }
  }, [engineHandle, isPlaying, isEnded]);

  // -------------------------------------------------------------------------
  // Seek (drag UX: previewTime on thumb, commit on release)
  // -------------------------------------------------------------------------
  const handleSeekStart = useCallback(() => {
    setIsDragging(true);
    setPreviewTime(currentTime);
  }, [currentTime]);

  const handleSeekMove = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setPreviewTime(t);
  }, []);

  const handleSeekEnd = useCallback(() => {
    if (engineHandle) {
      engineHandle.seek(previewTime);
    }
    setIsDragging(false);
  }, [engineHandle, previewTime]);

  // -------------------------------------------------------------------------
  // Volume & Mute
  // -------------------------------------------------------------------------
  const handleMuteToggle = useCallback(() => {
    if (!engineHandle) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    engineHandle.setMuted(newMuted);
  }, [engineHandle, isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!engineHandle) return;
    const v = parseFloat(e.target.value);
    setVolume(v);
    engineHandle.setVolume(v);
    if (v > 0 && isMuted) {
      setIsMuted(false);
      engineHandle.setMuted(false);
    }
  }, [engineHandle, isMuted]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (only with focus inside player)
  // -------------------------------------------------------------------------
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!engineHandle || !canInteract) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        handlePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        engineHandle.seek(Math.max(0, currentTime - 5));
        break;
      case 'ArrowRight':
        e.preventDefault();
        engineHandle.seek(Math.min(duration ?? Infinity, currentTime + 5));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (engineHandle.canSetVolume) {
          const newVol = Math.min(1, volume + 0.1);
          setVolume(newVol);
          engineHandle.setVolume(newVol);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (engineHandle.canSetVolume) {
          const newVol = Math.max(0, volume - 0.1);
          setVolume(newVol);
          engineHandle.setVolume(newVol);
        }
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        handleMuteToggle();
        break;
    }
  }, [engineHandle, canInteract, handlePlayPause, currentTime, duration, volume, handleMuteToggle]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const displayTime = isDragging ? previewTime : currentTime;
  const progress = duration ? (displayTime / duration) * 100 : 0;
  const canSetVolume = engineHandle?.canSetVolume ?? false;

  return (
    <LazyMotion features={domAnimation}>
      <div
        role="group"
        aria-label="Odtwarzacz nagrania"
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8"
        onKeyDown={handleKeyDown}
      >
        {/* Seekbar */}
        <div className="mb-3">
          <input
            ref={seekbarRef}
            type="range"
            min={0}
            max={duration ?? 0}
            step={0.1}
            value={displayTime}
            onChange={handleSeekMove}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            onTouchEnd={handleSeekEnd}
            disabled={!canInteract || !duration}
            aria-label="Pozycja odtwarzania"
            aria-valuemin={0}
            aria-valuemax={duration ?? 0}
            aria-valuenow={displayTime}
            aria-valuetext={formatTime(displayTime)}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                       bg-white/20 accent-htg-sage
                       [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-htg-sage
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(to right, #5A8A4E ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
            }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Play / Pause / Replay */}
          <m.button
            onClick={handlePlayPause}
            disabled={!canInteract}
            aria-label={isEnded ? 'Odtwórz ponownie' : isPlaying ? 'Pauza' : 'Odtwórz'}
            className="w-11 h-11 flex items-center justify-center rounded-full
                       bg-white/10 hover:bg-white/20 text-white transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage
                       disabled:opacity-40"
            whileTap={{ scale: 0.9 }}
          >
            {isEnded ? (
              <RotateCcw className="w-5 h-5" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </m.button>

          {/* Time display */}
          <div className="text-xs text-white/70 font-mono tabular-nums min-w-[80px]">
            {formatTime(displayTime)} / {formatTime(duration)}
          </div>

          {/* Refreshing indicator */}
          {status === 'refreshing' && (
            <div className="text-xs text-htg-warm animate-pulse">
              Buforowanie...
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Volume / Mute */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleMuteToggle}
              aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz'}
              className="w-9 h-9 flex items-center justify-center rounded-full
                         text-white/70 hover:text-white transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {canSetVolume && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Głośność"
                className="w-20 h-1 rounded-full appearance-none cursor-pointer
                           bg-white/20 accent-white
                           [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                           [&::-webkit-slider-thumb]:appearance-none"
              />
            )}
          </div>
        </div>

        {/* Screen reader announcements */}
        <div aria-live="polite" className="sr-only">
          {isPlaying && 'Odtwarzanie'}
          {status === 'paused' && 'Pauza'}
          {isEnded && 'Zakończono odtwarzanie'}
        </div>
      </div>
    </LazyMotion>
  );
}
