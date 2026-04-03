'use client';

// ---------------------------------------------------------------------------
// PlayerControls — redesigned controls for audio player
//
// Layout:
// - Central "green stone" play/pause button (large, pulsing, accessible)
// - Seekbar auto-hides during playback, appears on interaction
// - Time display bottom-right
// - Secondary controls (skip, speed, volume, fullscreen) around edges
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
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
  resumePosition?: number;
  controlsVisible: boolean;
  onInteraction: () => void;
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
  controlsVisible,
  onInteraction,
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

  // handleInteraction delegates to parent (which manages controlsVisible + hide timer)
  const handleInteraction = onInteraction;

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
    handleInteraction();
    if (isEnded) {
      engineHandle.seek(0);
      engineHandle.play();
    } else if (isPlaying) {
      engineHandle.pause();
    } else {
      engineHandle.play();
    }
  }, [engineHandle, isPlaying, isEnded, handleInteraction]);

  // -------------------------------------------------------------------------
  // Skip ±15s
  // -------------------------------------------------------------------------
  const handleSkipBack = useCallback(() => {
    if (!engineHandle) return;
    handleInteraction();
    engineHandle.seek(Math.max(0, currentTime - SKIP_SECONDS));
  }, [engineHandle, currentTime, handleInteraction]);

  const handleSkipForward = useCallback(() => {
    if (!engineHandle) return;
    handleInteraction();
    engineHandle.seek(Math.min(duration ?? Infinity, currentTime + SKIP_SECONDS));
  }, [engineHandle, currentTime, duration, handleInteraction]);

  // -------------------------------------------------------------------------
  // Seek (drag UX)
  // -------------------------------------------------------------------------
  const handleSeekStart = useCallback(() => {
    setIsDragging(true);
    setPreviewTime(currentTime);
    handleInteraction();
  }, [currentTime, handleInteraction]);

  const handleSeekMove = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewTime(parseFloat(e.target.value));
  }, []);

  const handleSeekEnd = useCallback(() => {
    if (engineHandle) engineHandle.seek(previewTime);
    setIsDragging(false);
    handleInteraction();
  }, [engineHandle, previewTime, handleInteraction]);

  // -------------------------------------------------------------------------
  // Volume & Mute
  // -------------------------------------------------------------------------
  const handleMuteToggle = useCallback(() => {
    if (!engineHandle) return;
    handleInteraction();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    engineHandle.setMuted(newMuted);
  }, [engineHandle, isMuted, handleInteraction]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!engineHandle) return;
    handleInteraction();
    const v = parseFloat(e.target.value);
    setVolume(v);
    engineHandle.setVolume(v);
    if (v > 0 && isMuted) {
      setIsMuted(false);
      engineHandle.setMuted(false);
    }
  }, [engineHandle, isMuted, handleInteraction]);

  // -------------------------------------------------------------------------
  // Playback speed
  // -------------------------------------------------------------------------
  const handleSpeedChange = useCallback((rate: number) => {
    if (!engineHandle) return;
    setPlaybackRate(rate);
    engineHandle.setPlaybackRate(rate);
    setShowSpeedMenu(false);
    handleInteraction();
  }, [engineHandle, handleInteraction]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!engineHandle || !canInteract) return;
    handleInteraction();

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
  }, [engineHandle, canInteract, handlePlayPause, handleSkipBack, handleSkipForward, volume, handleMuteToggle, onToggleFullscreen, handleInteraction]);

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
        className="absolute inset-0 pointer-events-none"
        onKeyDown={handleKeyDown}
      >
        {/* =============================================================== */}
        {/* CENTRAL PLAY/PAUSE — "green stone" button, always visible       */}
        {/* =============================================================== */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-auto">
          <div className="relative flex items-center gap-6 md:gap-0">
            {/* Skip back — visible on mobile beside play, absolute on desktop */}
            <m.button
              onClick={handleSkipBack}
              disabled={!canInteract}
              aria-label="Cofnij 15 sekund"
              className="w-11 h-11 md:w-10 md:h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full
                         text-white/30 md:text-white/70 hover:text-white
                         md:bg-black/30 md:backdrop-blur-sm md:hover:bg-white/15
                         transition-colors disabled:opacity-30
                         md:absolute md:top-1/2 md:-translate-y-1/2 md:-left-20
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 1.15 }}
            >
              <SkipBack className="w-6 h-6 md:w-6 md:h-6" />
            </m.button>

            {/* Play/Pause button */}
            <m.button
              onClick={handlePlayPause}
              disabled={!canInteract}
              aria-label={isEnded ? 'Odtwórz ponownie' : isPlaying ? 'Pauza' : 'Odtwórz'}
              className="relative w-24 h-24 md:w-36 md:h-36 flex items-center justify-center rounded-full
                         disabled:opacity-40 cursor-pointer
                         focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-htg-sage/60"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.06 }}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Outer glow — pulsing ring */}
              <m.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 40% 35%, rgba(110,190,85,0.25), rgba(90,138,78,0.12) 50%, rgba(45,107,45,0.06) 80%, transparent)',
                  boxShadow: '0 0 30px rgba(90,138,78,0.3), 0 0 60px rgba(90,138,78,0.12)',
                }}
                animate={{
                  scale: isPlaying ? [1, 1.08, 1] : [1, 1.04, 1],
                  opacity: isPlaying ? [0.7, 1, 0.7] : [0.5, 0.7, 0.5],
                }}
                transition={{
                  duration: isPlaying ? 2 : 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Stone body — layered radial gradients for depth */}
              <div
                className="absolute inset-1 rounded-full"
                style={{
                  background: `
                    radial-gradient(ellipse 60% 50% at 38% 32%, rgba(150,210,130,0.45), transparent 60%),
                    radial-gradient(ellipse 80% 80% at 50% 50%, rgba(90,138,78,0.95), rgba(61,107,50,0.9) 60%, rgba(45,85,35,0.85) 100%)
                  `,
                  boxShadow: `
                    inset 0 2px 8px rgba(150,210,130,0.3),
                    inset 0 -3px 6px rgba(30,60,25,0.4),
                    0 4px 16px rgba(0,0,0,0.4),
                    0 2px 6px rgba(0,0,0,0.3)
                  `,
                }}
              />

              {/* Subtle inner highlight arc (top specular) */}
              <div
                className="absolute top-2 left-3 right-3 h-6 rounded-full opacity-20"
                style={{
                  background: 'linear-gradient(to bottom, rgba(200,255,180,0.6), transparent)',
                }}
              />

              {/* Icon */}
              <div className="relative z-10 text-white drop-shadow-lg">
                {isEnded ? (
                  <RotateCcw className="w-10 h-10 md:w-14 md:h-14" strokeWidth={2} />
                ) : isPlaying ? (
                  <Pause className="w-10 h-10 md:w-14 md:h-14" strokeWidth={2} />
                ) : (
                  <Play className="w-10 h-10 md:w-14 md:h-14 ml-1" strokeWidth={2} />
                )}
              </div>
            </m.button>

            {/* Skip forward — visible on mobile beside play, absolute on desktop */}
            <m.button
              onClick={handleSkipForward}
              disabled={!canInteract}
              aria-label="Przewiń 15 sekund"
              className="w-11 h-11 md:w-10 md:h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full
                         text-white/30 md:text-white/70 hover:text-white
                         md:bg-black/30 md:backdrop-blur-sm md:hover:bg-white/15
                         transition-colors disabled:opacity-30
                         md:absolute md:top-1/2 md:-translate-y-1/2 md:-right-20
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 1.15 }}
            >
              <SkipForward className="w-6 h-6 md:w-6 md:h-6" />
            </m.button>
          </div>
        </div>

        {/* =============================================================== */}
        {/* BOTTOM BAR — seekbar + secondary controls (auto-hide)           */}
        {/* =============================================================== */}
        <AnimatePresence>
          {controlsVisible && (
            <m.div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-3 pt-10 pointer-events-auto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Resume hint */}
              {showResumeHint && resumePosition && resumePosition > 0 && duration && (
                <div className="mb-2 text-xs text-htg-sage/80 flex items-center gap-1.5">
                  <RotateCcw className="w-3 h-3" />
                  Wznowiono od {formatTime(resumePosition)}
                </div>
              )}

              {/* Seekbar */}
              <div className="mb-2.5">
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
                    background: `linear-gradient(to right, #5A8A4E ${progress}%, rgba(255,255,255,0.15) ${progress}%)`,
                  }}
                />
              </div>

              {/* Secondary controls row — functions LEFT, time RIGHT */}
              <div className="flex items-center gap-2">
                {/* Playback speed — LEFT */}
                <div className="relative" ref={speedMenuRef}>
                  <button
                    onClick={() => { setShowSpeedMenu(!showSpeedMenu); handleInteraction(); }}
                    aria-label={`Prędkość odtwarzania: ${playbackRate}x`}
                    className="h-8 px-2 flex items-center gap-1 rounded-md
                               text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span className="font-mono tabular-nums">{playbackRate}x</span>
                  </button>

                  {showSpeedMenu && (
                    <div className="absolute bottom-full left-0 mb-2 bg-black/90 backdrop-blur-sm
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

                {/* Volume / Mute — LEFT */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleMuteToggle}
                    aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz'}
                    className="w-8 h-8 flex items-center justify-center rounded-full
                               text-white/60 hover:text-white transition-colors
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
                      className="w-16 h-1 rounded-full appearance-none cursor-pointer
                                 bg-white/20 accent-white
                                 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                                 [&::-webkit-slider-thumb]:appearance-none"
                    />
                  )}
                </div>

                {/* Refreshing indicator */}
                {status === 'refreshing' && (
                  <div className="text-xs text-htg-warm animate-pulse">
                    Buforowanie...
                  </div>
                )}

                {/* Time display — LEFT (after volume) */}
                <div className="text-xs text-white/60 font-mono tabular-nums">
                  {formatTime(displayTime)} / {formatTime(duration)}
                </div>

                {/* Spacer */}
                <div className="flex-1" />
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* =============================================================== */}
        {/* TOP-RIGHT — Minimize + Fullscreen (4x larger, glow on interact)*/}
        {/* =============================================================== */}
        <div
          className={`absolute top-3 right-3 z-20 flex items-center gap-2 pointer-events-auto
                      transition-opacity duration-500
                      ${controlsVisible ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
        >
          {/* Minimize */}
          {!isMinimized && (
            <button
              onClick={onMinimize}
              aria-label="Minimalizuj odtwarzacz"
              className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl
                         backdrop-blur-sm transition-all duration-300
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage
                         ${controlsVisible
                           ? 'bg-white/15 text-white/90 shadow-lg shadow-black/20'
                           : 'bg-black/20 text-white/40'
                         }
                         hover:bg-white/25 hover:text-white hover:scale-105`}
            >
              <Minimize className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          )}

          {/* Fullscreen — hidden on mobile */}
          <button
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
            className={`hidden md:flex w-12 h-12 sm:w-14 sm:h-14 items-center justify-center rounded-xl
                       backdrop-blur-sm transition-all duration-300
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htg-sage
                       ${controlsVisible
                         ? 'bg-white/15 text-white/90 shadow-lg shadow-black/20'
                         : 'bg-black/20 text-white/40'
                       }
                       hover:bg-white/25 hover:text-white hover:scale-105`}
          >
            {isFullscreen
              ? <Minimize className="w-6 h-6 sm:w-7 sm:h-7" />
              : <Maximize className="w-6 h-6 sm:w-7 sm:h-7" />
            }
          </button>
        </div>

        {/* =============================================================== */}
        {/* TIME ALWAYS VISIBLE (bottom-right) even when controls hidden    */}
        {/* =============================================================== */}
        {!controlsVisible && (
          <div className="absolute bottom-3 left-4 text-xs text-white/40 font-mono tabular-nums pointer-events-auto">
            {formatTime(displayTime)} / {formatTime(duration)}
          </div>
        )}

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
