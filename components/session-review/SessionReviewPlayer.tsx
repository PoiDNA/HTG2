'use client';

// ---------------------------------------------------------------------------
// SessionReviewPlayer — audio-first player for booking recordings
//
// Orchestrator: holds playerState + stable refs.
// Features: fullscreen, minimize (mini-player bar), resume from last position,
// looping video background, fade-in reveal.
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, ShieldAlert, Play, Pause, X } from 'lucide-react';
import { AudioEngine, type AudioEngineHandle, type PlayerState } from './AudioEngine';
import PlayerControls from './PlayerControls';

const CONTROLS_HIDE_DELAY = 4000; // ms after last interaction
const VIDEO_BG_URL = 'https://htg2-cdn.b-cdn.net/HTG%20CYOU%20-%20Loop%20Canvas%200-3M.mp4';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SessionReviewPlayerProps {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  userEmail: string;
  userId: string;
  tokenEndpoint?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionReviewPlayer({
  playbackId,
  idFieldName,
  tokenEndpoint = '/api/video/booking-recording-token',
}: SessionReviewPlayerProps) {
  const engineRef = useRef<AudioEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ status: 'loading' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const autoplayAttemptedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch resume position for indicator
  useEffect(() => {
    fetch(`/api/video/play-position?${idFieldName}=${encodeURIComponent(playbackId)}`)
      .then(r => r.json())
      .then(d => { if (d.position > 0) setResumePosition(d.position); })
      .catch(() => {});
  }, [playbackId, idFieldName]);

  // Track fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const handleStateChange = useCallback((state: PlayerState) => {
    setPlayerState(state);
  }, []);

  // Autoplay: when audio is first ready (paused after load), attempt play
  useEffect(() => {
    if (autoplayAttemptedRef.current) return;
    if (playerState.status === 'paused' && engineRef.current) {
      autoplayAttemptedRef.current = true;
      // Small delay for fade-in to start before audio kicks in
      const timer = setTimeout(() => {
        engineRef.current?.play();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [playerState.status]);

  // Fade-in reveal: trigger after canvas becomes visible
  useEffect(() => {
    if (playerState.status !== 'loading' && !isRevealed) {
      // Start fade-in after a brief moment (let canvas mount)
      const timer = setTimeout(() => setIsRevealed(true), 50);
      return () => clearTimeout(timer);
    }
  }, [playerState.status, isRevealed]);

  // Block context menu on the player
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Controls visibility management (lifted from PlayerControls)
  const isPlayingRef = useRef(false);
  isPlayingRef.current = playerState.status === 'playing';

  const handleInteraction = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlayingRef.current) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    }
  }, []);

  // Auto-hide when playing, always show when paused/ended
  useEffect(() => {
    const playing = playerState.status === 'playing';
    if (!playing) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playerState.status]);

  const handleContainerPointerMove = useCallback(() => {
    handleInteraction();
  }, [handleInteraction]);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    } else {
      const el = containerRef.current;
      if (!el) return;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    }
  }, [isFullscreen]);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const handleMiniPlayPause = useCallback(() => {
    if (!engineRef.current) return;
    const snap = engineRef.current.getSnapshot();
    if (snap.paused) {
      engineRef.current.play();
    } else {
      engineRef.current.pause();
    }
  }, []);

  const status = playerState.status;
  const isPlaying = status === 'playing';
  const showVideo = status !== 'loading' && status !== 'blocked' && status !== 'error' && status !== 'unsupported';
  const showControls = showVideo;

  // -------------------------------------------------------------------------
  // Mini-player bar (fixed at bottom of viewport)
  // -------------------------------------------------------------------------
  if (isMinimized) {
    return (
      <>
        {/* Hidden main player (keeps audio + engine alive) */}
        <div className="sr-only" aria-hidden="true">
          <AudioEngine
            ref={engineRef}
            playbackId={playbackId}
            idFieldName={idFieldName}
            tokenEndpoint={tokenEndpoint}
            onStateChange={handleStateChange}
            containerEl={containerRef.current}
          />
        </div>

        {/* Floating mini-player bar */}
        <div className="fixed bottom-4 left-4 right-4 z-50 max-w-lg mx-auto
                        bg-[#0D1A12]/95 backdrop-blur-md rounded-xl border border-white/10
                        shadow-2xl px-4 py-3 flex items-center gap-3">
          {/* Mini play/pause */}
          <button
            onClick={handleMiniPlayPause}
            className="w-10 h-10 flex items-center justify-center rounded-full
                       bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          {/* Mini info */}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/70 truncate">
              {isPlaying ? 'Odtwarzanie nagrania...' : 'Pauza'}
            </div>
            <MiniSeekbar engineHandle={engineRef.current} />
          </div>

          {/* Restore button */}
          <button
            onClick={handleRestore}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Przywróć odtwarzacz"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Full player
  // -------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-[#0D1A12] rounded-xl overflow-hidden select-none cursor-pointer
        ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-[9/14] md:aspect-video'}`}
      onContextMenu={handleContextMenu}
      onPointerMove={handleContainerPointerMove}
    >
      {/* Audio engine (hidden) */}
      <AudioEngine
        ref={engineRef}
        playbackId={playbackId}
        idFieldName={idFieldName}
        tokenEndpoint={tokenEndpoint}
        onStateChange={handleStateChange}
        containerEl={containerRef.current}
      />

      {/* Video background — looping ambient video, fade-in reveal */}
      {showVideo && (
        <div
          className="absolute inset-0 transition-opacity duration-[1500ms] ease-out"
          style={{ opacity: isRevealed ? 1 : 0 }}
        >
          <video
            src={VIDEO_BG_URL}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Player controls — fade in with canvas */}
      {showControls && (
        <div
          className="transition-opacity duration-1000 ease-out delay-500"
          style={{ opacity: isRevealed ? 1 : 0 }}
        >
        <PlayerControls
          engineHandle={engineRef.current}
          playerState={playerState}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onMinimize={handleMinimize}
          isMinimized={false}
          resumePosition={resumePosition}
          controlsVisible={controlsVisible}
          onInteraction={handleInteraction}
        />
        </div>
      )}

      {/* Loading overlay — fades out as canvas reveals */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-[#0D1A12] z-10
                    transition-opacity duration-1000 ease-out pointer-events-none
                    ${isRevealed && status !== 'loading' ? 'opacity-0' : 'opacity-100'}`}
      >
        {status === 'loading' && (
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Ładowanie nagrania...</p>
          </div>
        )}
      </div>

      {/* Blocked overlay */}
      {status === 'blocked' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <AlertCircle className="w-12 h-12 text-htg-warm mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{playerState.title}</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Błąd odtwarzania</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}

      {/* Unsupported overlay */}
      {status === 'unsupported' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <ShieldAlert className="w-12 h-12 text-htg-lavender mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Format nieobsługiwany</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniSeekbar — tiny progress bar for the mini-player
// ---------------------------------------------------------------------------

function MiniSeekbar({ engineHandle }: { engineHandle: AudioEngineHandle | null }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!engineHandle) return;
    const unsubTime = engineHandle.subscribeToTime(setCurrentTime);
    const unsubDur = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubTime(); unsubDur(); };
  }, [engineHandle]);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-htg-sage/70 transition-[width] duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
