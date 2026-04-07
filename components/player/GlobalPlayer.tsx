'use client';

import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine, type AudioEngineHandle } from '@/components/session-review/AudioEngine';
import { usePlayer } from '@/lib/player-context';

/**
 * GlobalPlayer — mounts AudioEngine at layout level for cross-page persistence.
 * Used by V3 "Sanctum" to keep audio playing during navigation.
 * Hidden from view — the StickyPlayer provides the visible UI.
 */
export default function GlobalPlayer() {
  const { activeSession, setPlayerState, setEngineHandle } = usePlayer();
  const engineRef = useRef<AudioEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const currentPlaybackIdRef = useRef<string | null>(null);

  // Reset autoplay flag when session changes
  useEffect(() => {
    if (activeSession?.playbackId !== currentPlaybackIdRef.current) {
      autoplayAttemptedRef.current = false;
      currentPlaybackIdRef.current = activeSession?.playbackId ?? null;
    }
  }, [activeSession?.playbackId]);

  const handleStateChange = useCallback((state: import('@/components/session-review/AudioEngine').PlayerState) => {
    setPlayerState(state);

    // Autoplay when first loaded
    if (!autoplayAttemptedRef.current && state.status === 'paused' && engineRef.current) {
      autoplayAttemptedRef.current = true;
      setTimeout(() => engineRef.current?.play(), 300);
    }
  }, [setPlayerState]);

  // Expose engine handle to context
  useEffect(() => {
    setEngineHandle(engineRef.current);
  }, [engineRef.current, setEngineHandle]);

  if (!activeSession) return null;

  return (
    <div ref={containerRef} className="sr-only" aria-hidden="true">
      <AudioEngine
        ref={engineRef}
        playbackId={activeSession.playbackId}
        idFieldName={activeSession.idFieldName}
        tokenEndpoint={activeSession.tokenEndpoint}
        onStateChange={handleStateChange}
        containerEl={containerRef.current}
      />
    </div>
  );
}
