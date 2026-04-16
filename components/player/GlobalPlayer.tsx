'use client';

import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine, type AudioEngineHandle } from '@/components/session-review/AudioEngine';
import { usePlayer, playbackToEngineProps, playbackToAnalyticsContext, playbackToRange } from '@/lib/player-context';

/**
 * GlobalPlayer — mounts AudioEngine at layout level for cross-page persistence.
 * Used by V3 "Sanctum" to keep audio playing during navigation.
 * Hidden from view — the StickyPlayer provides the visible UI.
 *
 * Uses `activePlayback` (tagged union) to derive engine props, playbackRange,
 * and analyticsContext. Falls back to legacy `activeSession` shape for the
 * AudioEngine props until AudioEngine itself is updated in PR 6.
 */
export default function GlobalPlayer() {
  const { activePlayback, setPlayerState, setEngineHandle } = usePlayer();
  const engineRef = useRef<AudioEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const currentPlaybackKeyRef = useRef<string | null>(null);

  // Derive a stable key from the active playback (resets autoplay on change)
  const playbackKey = activePlayback
    ? `${activePlayback.kind}:${'saveId' in activePlayback ? activePlayback.saveId : 'sessionFragmentId' in activePlayback ? activePlayback.sessionFragmentId : 'sessionId' in activePlayback ? activePlayback.sessionId : (activePlayback as { recordingId: string }).recordingId}`
    : null;

  useEffect(() => {
    if (playbackKey !== currentPlaybackKeyRef.current) {
      autoplayAttemptedRef.current = false;
      currentPlaybackKeyRef.current = playbackKey;
    }
  }, [playbackKey]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineRef.current, setEngineHandle]);

  if (!activePlayback) return null;

  const engineProps = playbackToEngineProps(activePlayback);
  // playbackRange and analyticsContext are forwarded to AudioEngine in PR 6
  // (after AudioEngine props are extended). Computed here for future use.
  // const range = playbackToRange(activePlayback);
  // const analyticsContext = playbackToAnalyticsContext(activePlayback);

  return (
    <div ref={containerRef} className="sr-only" aria-hidden="true">
      <AudioEngine
        ref={engineRef}
        playbackId={engineProps.playbackId}
        idFieldName={engineProps.idFieldName}
        tokenEndpoint={engineProps.tokenEndpoint}
        onStateChange={handleStateChange}
        containerEl={containerRef.current}
      />
    </div>
  );
}
