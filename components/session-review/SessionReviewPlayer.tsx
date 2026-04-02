'use client';

// ---------------------------------------------------------------------------
// SessionReviewPlayer — audio-first player for booking recordings
//
// Orchestrator: holds playerState + motionMode + stable refs.
// Does NOT read time/duration. analysisState is local in MandalaCanvas.
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { AudioEngine, type AudioEngineHandle, type PlayerState } from './AudioEngine';
import MandalaCanvas from './MandalaCanvas';
import PlayerControls from './PlayerControls';

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
  userEmail,
  userId,
  tokenEndpoint = '/api/video/booking-recording-token',
}: SessionReviewPlayerProps) {
  const engineRef = useRef<AudioEngineHandle>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ status: 'loading' });
  const [motionMode, setMotionMode] = useState<'full' | 'reduced'>('full');

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotionMode(mq.matches ? 'reduced' : 'full');
    const onChange = (e: MediaQueryListEvent) => setMotionMode(e.matches ? 'reduced' : 'full');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleStateChange = useCallback((state: PlayerState) => {
    setPlayerState(state);
  }, []);

  // Block context menu on the player
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const status = playerState.status;
  const isPlaying = status === 'playing';
  const showCanvas = status !== 'loading' && status !== 'blocked' && status !== 'error' && status !== 'unsupported';
  const showControls = showCanvas;

  return (
    <div
      className="relative w-full aspect-video bg-[#0D1A12] rounded-xl overflow-hidden select-none"
      onContextMenu={handleContextMenu}
    >
      {/* Audio engine (hidden) */}
      <AudioEngine
        ref={engineRef}
        playbackId={playbackId}
        idFieldName={idFieldName}
        tokenEndpoint={tokenEndpoint}
        onStateChange={handleStateChange}
      />

      {/* Animated canvas */}
      {showCanvas && (
        <MandalaCanvas
          engineHandle={engineRef.current}
          userEmail={userEmail}
          userId={userId}
          isPlaying={isPlaying || status === 'refreshing'}
          motionMode={motionMode}
        />
      )}

      {/* Player controls */}
      {showControls && (
        <PlayerControls
          engineHandle={engineRef.current}
          playerState={playerState}
        />
      )}

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Ładowanie nagrania...</p>
          </div>
        </div>
      )}

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
