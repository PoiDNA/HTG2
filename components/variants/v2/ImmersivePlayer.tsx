'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { AudioEngine, type AudioEngineHandle, type PlayerState } from '@/components/session-review/AudioEngine';
import PlayerControls from '@/components/session-review/PlayerControls';

const CONTROLS_HIDE_DELAY = 3000;

interface ImmersivePlayerProps {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  userEmail: string;
  userId: string;
  tokenEndpoint?: string;
  onEnd?: () => void;
}

/**
 * V2 "Sanctuary" Immersive Player
 * Fullscreen-like experience. Tap anywhere = pause/play.
 * Auto-hide all chrome after 3s. MandalaCanvas-style dark background.
 * Audio continues on lock screen, pauses on app switch (via OS).
 */
export default function ImmersivePlayer({
  playbackId,
  idFieldName,
  tokenEndpoint = '/api/video/booking-recording-token',
  onEnd,
}: ImmersivePlayerProps) {
  const engineRef = useRef<AudioEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ status: 'loading' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [resumePosition, setResumePosition] = useState(0);
  const [showPostSession, setShowPostSession] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const autoplayAttemptedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // Fetch resume position
  useEffect(() => {
    fetch(`/api/video/play-position?${idFieldName}=${encodeURIComponent(playbackId)}`)
      .then(r => r.json())
      .then(d => { if (d.position > 0) setResumePosition(d.position); })
      .catch(() => {});
  }, [playbackId, idFieldName]);

  // Track fullscreen
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleStateChange = useCallback((state: PlayerState) => {
    setPlayerState(state);
    if (state.status === 'ended') {
      setShowPostSession(true);
    }
  }, []);

  // Autoplay
  useEffect(() => {
    if (autoplayAttemptedRef.current) return;
    if (playerState.status === 'paused' && engineRef.current) {
      autoplayAttemptedRef.current = true;
      setTimeout(() => engineRef.current?.play(), 600);
    }
  }, [playerState.status]);

  // Reveal fade-in
  useEffect(() => {
    if (playerState.status !== 'loading' && !isRevealed) {
      const timer = setTimeout(() => setIsRevealed(true), 50);
      return () => clearTimeout(timer);
    }
  }, [playerState.status, isRevealed]);

  isPlayingRef.current = playerState.status === 'playing';

  // Controls auto-hide
  const handleInteraction = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlayingRef.current) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, []);

  useEffect(() => {
    if (playerState.status !== 'playing') {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [playerState.status]);

  // Tap to play/pause (on the background, not on controls)
  const handleBackgroundTap = useCallback((e: React.MouseEvent) => {
    // Don't trigger if clicking on controls
    if ((e.target as HTMLElement).closest('[data-player-controls]')) return;
    if (!engineRef.current) return;
    const snap = engineRef.current.getSnapshot();
    if (snap.paused) {
      engineRef.current.play();
    } else {
      engineRef.current.pause();
    }
    handleInteraction();
  }, [handleInteraction]);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      document.exitFullscreen().catch(() => setIsFullscreen(false));
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => setIsFullscreen(true));
    }
  }, [isFullscreen]);

  const status = playerState.status;
  const showVideo = status !== 'loading' && status !== 'blocked' && status !== 'error' && status !== 'unsupported';

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-[#0D1A12] rounded-xl overflow-hidden select-none cursor-pointer
        ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-square md:aspect-video'}`}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleBackgroundTap}
      onPointerMove={handleInteraction}
    >
      <AudioEngine
        ref={engineRef}
        playbackId={playbackId}
        idFieldName={idFieldName}
        tokenEndpoint={tokenEndpoint}
        onStateChange={handleStateChange}
        containerEl={containerRef.current}
      />

      {/* Dark ambient background — V2 uses solid dark, not video loop */}
      {showVideo && (
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#0D1A12] via-[#0A1510] to-[#081210] transition-opacity duration-[1500ms]"
          style={{ opacity: isRevealed ? 1 : 0 }}
        />
      )}

      {/* Center play/pause indicator (brief flash on tap) */}
      {showVideo && isRevealed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`transition-opacity duration-300 ${controlsVisible && status !== 'playing' ? 'opacity-60' : 'opacity-0'}`}>
            {status === 'paused' ? (
              <Play className="w-16 h-16 text-white/80" />
            ) : (
              <Pause className="w-16 h-16 text-white/80" />
            )}
          </div>
        </div>
      )}

      {/* Controls — auto-hide after 3s */}
      {showVideo && (
        <div
          data-player-controls
          className="transition-opacity duration-500"
          style={{ opacity: isRevealed && controlsVisible ? 1 : 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <PlayerControls
            engineHandle={engineRef.current}
            playerState={playerState}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            onMinimize={() => {}}
            isMinimized={false}
            resumePosition={resumePosition}
            controlsVisible={controlsVisible}
            onInteraction={handleInteraction}
          />
        </div>
      )}

      {/* Loading */}
      <div className={`absolute inset-0 flex items-center justify-center bg-[#0D1A12] z-10 transition-opacity duration-1000 pointer-events-none ${isRevealed && status !== 'loading' ? 'opacity-0' : 'opacity-100'}`}>
        {status === 'loading' && (
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Ładowanie...</p>
          </div>
        )}
      </div>

      {/* Blocked */}
      {status === 'blocked' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <AlertCircle className="w-12 h-12 text-htg-warm mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{playerState.title}</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Błąd odtwarzania</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}

      {/* Unsupported */}
      {status === 'unsupported' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white max-w-md px-6">
            <ShieldAlert className="w-12 h-12 text-htg-lavender mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Format nieobsługiwany</h3>
            <p className="text-white/70 text-sm">{playerState.message}</p>
          </div>
        </div>
      )}

      {/* Post-session note overlay (V2 Sanctuary) */}
      {showPostSession && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1A12]/95 z-30 animate-in fade-in duration-1000">
          <div className="text-center max-w-md px-6 w-full">
            {noteSaved ? (
              <div className="animate-in fade-in duration-500">
                <p className="text-white/70 text-sm mb-6">Zapisano.</p>
                <button
                  onClick={() => { setShowPostSession(false); onEnd?.(); }}
                  className="px-6 py-3 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo-light transition-colors"
                >
                  Wróć do panelu
                </button>
              </div>
            ) : (
              <>
                <p className="text-white/60 text-sm mb-4">Zostaw ślad z teraz (opcjonalnie)</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 resize-none min-h-[80px] mb-2"
                  rows={3}
                />
                <p className="text-white/30 text-xs mb-6">To widzisz tylko Ty</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      // TODO: save note to backend when API exists
                      if (note.trim()) setNoteSaved(true);
                      else { setShowPostSession(false); onEnd?.(); }
                    }}
                    className="px-6 py-3 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo-light transition-colors"
                  >
                    {note.trim() ? 'Zapisz i zakończ' : 'Zakończ bez notatki'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
