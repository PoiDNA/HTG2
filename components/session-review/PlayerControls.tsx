'use client';

// ---------------------------------------------------------------------------
// PlayerControls — custom audio controls with a11y
//
// Updates via subscribeToTime (immediate + post-action), NOT rAF.
// Drag: pointer state + commit on release, no rAF in controls.
// Volume: capability-driven (canSetVolume), not platform guess.
// Features: play/pause, seek, skip ±15s, speed, volume, fullscreen, minimize
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX,
  Maximize, Minimize, SkipBack, SkipForward, Gauge,
} from 'lucide-react';
import type { AudioEngineHandle, PlayerState } from './AudioEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const SKIP_SECONDS = 15;

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
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onMinimize: () => void;
  isMinimized: boolean;
  resumePosition?: number; // Show resume indicator
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerControls({
  engineHandle,
  playerState,
  isFullscreen,
  onToggleFullscreen,
  onMinimize,
  isMinimized,
  resumePosition,
}: PlayerControlsProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showResumeHint, setShowResumeHint] = useState(!!resumePosition && resumePosition > 0);

  const seekbarRef = useRef<HTMLInputElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const status = playerState.status;
  const isPlaying = status === 'playing';
  const isEnded = status === 'ended';
  const canInteract = isPlaying || status === 'paused' || isEnded || status === 'refreshing';

  // Hide resume hint after first play
  useEffect(() => {
    if (isPlaying && showResumeHint) {
      const timer = setTimeout(() => setShowResumeHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, showResumeHint]);

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

  // Close speed menu on click outside
  useEffect(() => {
    if (!showSpeedMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('pointerdown', onClickOutside);
    return () => document.removeEventListener('pointerdown', onClickOutside);
  }, [showSpeedMenu]);

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
  // Skip ±15s
  // -------------------------------------------------------------------------
  const handleSkipBack = useCallback(() => {
    if (!engineHandle) return;
    engineHandle.seek(Math.max(0, currentTime - SKIP_SECONDS));
  }, [engineHandle, currentTime]);

  const handleSkipForward = useCallback(() => {
    if (!engineHandle) return;
    engineHandle.seek(Math.min(duration ?? Infinity, currentTime + SKIP_SECONDS));
  }, [engineHandle, currentTime, duration]);

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
  // Playback speed
  // -------------------------------------------------------------------------
  const handleSpeedChange = useCallback((rate: number) => {
    if (!engineHandle) return;
    setPlaybackRate(rate);
    engineHandle.setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, [engineHandle]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
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
        handleSkipBack();
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleSkipForward();
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
      case 'f':
      case 'F':
        e.preventDefault();
        onToggleFullscreen();
        break;
    }
  }, [engineHandle, canInteract, handlePlayPause, handleSkipBack, handleSkipForward, volume, handleMuteToggle, onToggleFullscreen]);

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
        {/* Resume position indicator */}
        {showResumeHint && resumePosition && resumePosition > 0 && duration && (
          <div className="mb-2 text-xs text-htg-sage/80 flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3" />
            Wznowiono od {formatTime(resumePosition)}
          </div>
        )}

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
        <div className="flex items-center gap-2">
          {/* Skip back 15s */}
          <m.button
            onClick={handleSkipBack}
            disabled={!canInteract}
            aria-label="Cofnij 15 sekund"
            className="w-9 h-9 flex items-center justify-center rounded-full
                       text-white/70 hover:text-white hover:bg-white/10 transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage
                       disabled:opacity-40"
            whileTap={{ scale: 0.9 }}
          >
            <SkipBack className="w-4 h-4" />
          </m.button>

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

          {/* Skip forward 15s */}
          <m.button
            onClick={handleSkipForward}
            disabled={!canInteract}
            aria-label="Przewiń 15 sekund"
            className="w-9 h-9 flex items-center justify-center rounded-full
                       text-white/70 hover:text-white hover:bg-white/10 transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage
                       disabled:opacity-40"
            whileTap={{ scale: 0.9 }}
          >
            <SkipForward className="w-4 h-4" />
          </m.button>

          {/* Time display */}
          <div className="text-xs text-white/70 font-mono tabular-nums min-w-[80px] ml-1">
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

          {/* Playback speed */}
          <div className="relative" ref={speedMenuRef}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              aria-label={`Prędkość odtwarzania: ${playbackRate}x`}
              className="h-8 px-2 flex items-center gap-1 rounded-md
                         text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">{playbackRate}x</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-sm
                              rounded-lg border border-white/10 py-1 min-w-[80px] z-30">
                {PLAYBACK_RATES.map(rate => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`w-full px-3 py-1.5 text-xs text-left transition-colors
                      ${rate === playbackRate
                        ? 'text-htg-sage bg-white/10'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Minimize */}
          {!isMinimized && (
            <button
              onClick={onMinimize}
              aria-label="Minimalizuj odtwarzacz"
              className="w-9 h-9 flex items-center justify-center rounded-full
                         text-white/70 hover:text-white transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
            >
              <Minimize className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
            className="w-9 h-9 flex items-center justify-center rounded-full
                       text-white/70 hover:text-white transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>
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
