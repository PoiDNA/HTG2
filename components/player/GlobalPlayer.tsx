'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { AudioEngine, type AudioEngineHandle } from '@/components/session-review/AudioEngine';
import { usePlayer, playbackToEngineProps, playbackToAnalyticsContext, playbackToRange } from '@/lib/player-context';

/**
 * GlobalPlayer — mounts AudioEngine at layout level for cross-page persistence.
 * Used by V3 "Sanctum" to keep audio playing during navigation.
 * Hidden from view — the StickyPlayer provides the visible UI.
 *
 * Uses `activePlayback` (tagged union) to derive engine props, playbackRange,
 * analyticsContext, and tokenRequestBuilder. Disables play-position resume
 * for fragment variants (meaningless for sub-clips).
 */
export default function GlobalPlayer() {
  const { activePlayback, setPlayerState, setEngineHandle } = usePlayer();
  const engineRef = useRef<AudioEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const currentPlaybackKeyRef = useRef<string | null>(null);

  // Derive a stable key from the active playback (resets autoplay on change)
  const playbackKey = activePlayback
    ? `${activePlayback.kind}:${
        'saveId' in activePlayback
          ? activePlayback.saveId
          : 'sessionFragmentId' in activePlayback
          ? activePlayback.sessionFragmentId
          : 'sessionId' in activePlayback
          ? activePlayback.sessionId
          : (activePlayback as { recordingId: string }).recordingId
      }`
    : null;

  useEffect(() => {
    if (playbackKey !== currentPlaybackKeyRef.current) {
      autoplayAttemptedRef.current = false;
      currentPlaybackKeyRef.current = playbackKey;
    }
  }, [playbackKey]);

  const handleStateChange = useCallback(
    (state: import('@/components/session-review/AudioEngine').PlayerState) => {
      setPlayerState(state);
      // Autoplay when first loaded
      if (!autoplayAttemptedRef.current && state.status === 'paused' && engineRef.current) {
        autoplayAttemptedRef.current = true;
        setTimeout(() => engineRef.current?.play(), 300);
      }
    },
    [setPlayerState],
  );

  // Expose engine handle to context
  useEffect(() => {
    setEngineHandle(engineRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineRef.current, setEngineHandle]);

  // Token request body override for fragment_radio (needs `radio: true`)
  const tokenRequestBuilder = useMemo(() => {
    if (!activePlayback || activePlayback.kind !== 'fragment_radio') return undefined;
    const saveId = activePlayback.saveId;
    return (deviceId: string) => ({ saveId, deviceId, radio: true });
  }, [activePlayback]);

  if (!activePlayback) return null;

  const engineProps = playbackToEngineProps(activePlayback);
  const range = playbackToRange(activePlayback);
  const analyticsCtx = playbackToAnalyticsContext(activePlayback);

  // Fragment playback disables play-position resume (meaningless for clips)
  const isFragment =
    activePlayback.kind === 'fragment_review' ||
    activePlayback.kind === 'fragment_radio' ||
    activePlayback.kind === 'fragment_recording_review' ||
    activePlayback.kind === 'impulse' ||
    activePlayback.kind === 'pytania_answer';

  return (
    <div ref={containerRef} className="sr-only" aria-hidden="true">
      <AudioEngine
        ref={engineRef}
        playbackId={engineProps.playbackId}
        idFieldName={engineProps.idFieldName}
        tokenEndpoint={engineProps.tokenEndpoint}
        onStateChange={handleStateChange}
        containerEl={containerRef.current}
        playbackRange={range ?? undefined}
        analyticsContext={analyticsCtx}
        endpoints={isFragment ? {
          playPosition: null,
          heartbeat: '/api/video/fragment-heartbeat',
          stop: '/api/video/fragment-stop',
        } : undefined}
        tokenRequestBuilder={tokenRequestBuilder}
      />
    </div>
  );
}
