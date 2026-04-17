'use client';

// ---------------------------------------------------------------------------
// AudioEngine — FULL playback lifecycle for booking recording audio
//
// Manages: <audio> element, HLS.js/Safari native/direct file, token fetch,
// token refresh (reload + restore), heartbeat, play-event, play-position,
// concurrent streams, cleanup. Audio analysis graph is best-effort optional.
//
// Exposes an imperative handle (no raw DOM) + discriminated PlayerState.
//
// PR 6 extensions (all optional / backward-compatible):
//   endpoints            — override individual API URLs; playPosition: null disables
//   tokenRequestBuilder  — override token request body
//   playbackRange        — seek to startSec on load, stop at endSec
//   analyticsContext     — session_type for play-events
// ---------------------------------------------------------------------------

import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { createPlaybackAudioGraph, type PlaybackAudioGraph } from './createPlaybackAudioGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerState =
  | { status: 'loading' }
  | { status: 'playing' }
  | { status: 'paused' }
  | { status: 'ended' }
  | { status: 'refreshing' }
  | { status: 'blocked'; title: string; message: string }
  | { status: 'error'; message: string }
  | { status: 'unsupported'; message: string };

export interface AudioSnapshot {
  currentTime: number;
  duration: number | null;  // NaN/Infinity → null
  paused: boolean;
  volume: number;
  muted: boolean;
}

export type AnalyticsContext =
  | 'vod'
  | 'recording'
  | 'live'
  | 'fragment_review'
  | 'fragment_radio'
  | 'fragment_recording_review';

export interface AudioEngineEndpoints {
  /** Override heartbeat URL (default: '/api/video/heartbeat') */
  heartbeat?: string;
  /** Override stop URL (default: '/api/video/stop') */
  stop?: string;
  /** Override play-event URL (default: '/api/video/play-event') */
  playEvent?: string;
  /**
   * Override play-position URL (default: '/api/video/play-position').
   * Set to null to DISABLE resume fetch AND position heartbeat writes
   * (used for fragment playback where position resume is meaningless).
   */
  playPosition?: string | null;
}

export interface AudioEngineHandle {
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setPlaybackRate(rate: number): void;
  getSnapshot(): AudioSnapshot;
  getAnalyser(): AnalyserNode | null;
  readonly canSetVolume: boolean;
  subscribeToTime(cb: (t: number) => void): () => void;
  subscribeToDuration(cb: (d: number | null) => void): () => void;
  /** Request fullscreen on the player container */
  requestFullscreen(): void;
  exitFullscreen(): void;
  // ── PR 6 additions ────────────────────────────────────────────────────────
  /** Update playback range without remounting the engine (used by radio player). */
  setPlaybackRange(range: { startSec: number; endSec: number } | null): void;
  /**
   * Ramp volume from 0 → current volume over durationMs.
   * Saves the target volume before fade starts; restores it on completion.
   */
  fadeIn(durationMs: number): void;
  /**
   * Ramp volume from current → 0 over durationMs, then pause.
   * Does NOT emit state change — caller manages next action.
   */
  fadeOut(durationMs: number): void;
  /** Subscribe to fragment-end boundary (currentTime >= endSec). */
  subscribeToFragment(cb: () => void): () => void;
}

interface AudioEngineProps {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  tokenEndpoint: string;
  onStateChange: (state: PlayerState) => void;
  /** Container element for fullscreen API */
  containerEl?: HTMLElement | null;
  // ── PR 6 additions ────────────────────────────────────────────────────────
  /** Override individual API endpoint URLs. */
  endpoints?: AudioEngineEndpoints;
  /**
   * Override token request body builder. Called with deviceId.
   * Default: `{ [idFieldName]: playbackId, deviceId }`.
   */
  tokenRequestBuilder?: (deviceId: string) => object;
  /**
   * Constrain playback to a sub-range of the source media.
   * On source ready → seek to startSec. On timeupdate → pause+notify at endSec.
   */
  playbackRange?: { startSec: number; endSec: number } | null;
  /**
   * session_type for play-event analytics.
   * Default: `idFieldName === 'recordingId' ? 'recording' : 'vod'`.
   */
  analyticsContext?: AnalyticsContext;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDeviceId(): string {
  const key = 'htg-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function normalizeDuration(d: number): number | null {
  if (d == null || !isFinite(d) || isNaN(d)) return null;
  return d;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AudioEngine = forwardRef<AudioEngineHandle, AudioEngineProps>(
  function AudioEngine(
    {
      playbackId,
      idFieldName,
      tokenEndpoint,
      onStateChange,
      containerEl,
      endpoints,
      tokenRequestBuilder,
      playbackRange,
      analyticsContext,
    },
    ref,
  ) {
    const audioRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const graphRef = useRef<PlaybackAudioGraph | null>(null);
    const graphCreatedRef = useRef(false);

    const deviceIdRef = useRef('');
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playEventIdRef = useRef<string | null>(null);
    const playStartRef = useRef(0);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resumePositionRef = useRef<number | null>(null);
    const resumeFetchedRef = useRef(false);
    const containerRef = useRef<HTMLElement | null>(null);

    // Subscription sets
    const timeListeners = useRef(new Set<(t: number) => void>());
    const durationListeners = useRef(new Set<(d: number | null) => void>());
    const fragmentListeners = useRef(new Set<() => void>());

    // Capability detection
    const canSetVolumeRef = useRef(true);

    // Current state ref for internal reads (avoids stale closures)
    const stateRef = useRef<PlayerState>({ status: 'loading' });

    // Attempt lifecycle and retry refs
    const abortRef = useRef<AbortController | null>(null);
    const attemptIdRef = useRef(0);
    const loadedMetadataHandlerRef = useRef<(() => void) | null>(null);
    const errorHandlerRef = useRef<(() => void) | null>(null);
    const retryCountRef = useRef(0);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── PR 6: mutable prop refs (sync every render, avoids re-mount on change) ──
    // Assigning directly in render body is safe because: (1) React renders synchronously,
    // (2) closures created in useCallback/useEffect read .current at call time, not capture time.
    const endpointsRef = useRef(endpoints);
    endpointsRef.current = endpoints;

    const tokenRequestBuilderRef = useRef(tokenRequestBuilder);
    tokenRequestBuilderRef.current = tokenRequestBuilder;

    const analyticsContextRef = useRef(analyticsContext);
    analyticsContextRef.current = analyticsContext;

    const playbackRangeRef = useRef(playbackRange ?? null);
    playbackRangeRef.current = playbackRange ?? null;

    // Fade state
    const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const preFadeVolumeRef = useRef(1); // volume before fade started

    // Sync container ref from prop
    useEffect(() => {
      containerRef.current = containerEl ?? null;
    }, [containerEl]);

    const emitState = useCallback((state: PlayerState) => {
      stateRef.current = state;
      onStateChange(state);
    }, [onStateChange]);

    const emitTime = useCallback((t: number) => {
      timeListeners.current.forEach(cb => cb(t));
    }, []);

    const emitDuration = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const d = normalizeDuration(audio.duration);
      durationListeners.current.forEach(cb => cb(d));
    }, []);

    // -----------------------------------------------------------------------
    // Endpoint helpers (reads from ref so closures always see current value)
    // -----------------------------------------------------------------------
    const getHeartbeatUrl = useCallback(
      () => endpointsRef.current?.heartbeat ?? '/api/video/heartbeat',
      [],
    );
    const getStopUrl = useCallback(
      () => endpointsRef.current?.stop ?? '/api/video/stop',
      [],
    );
    const getPlayEventUrl = useCallback(
      () => endpointsRef.current?.playEvent ?? '/api/video/play-event',
      [],
    );
    const getPlayPositionUrl = useCallback((): string | null => {
      const v = endpointsRef.current?.playPosition;
      // undefined → use default; null → disabled; string → custom
      if (v === undefined) return '/api/video/play-position';
      return v; // null or custom string
    }, []);

    // -----------------------------------------------------------------------
    // Stop stream (cleanup)
    // -----------------------------------------------------------------------
    const stopPlayEvent = useCallback(() => {
      if (playEventIdRef.current) {
        const duration = Math.floor((Date.now() - playStartRef.current) / 1000);
        fetch(getPlayEventUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stop',
            eventId: playEventIdRef.current,
            durationSeconds: duration,
          }),
        }).catch(() => {});
        playEventIdRef.current = null;
      }
    }, [getPlayEventUrl]);

    const stopStream = useCallback(() => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      try {
        fetch(getStopUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId }),
        });
      } catch {}
    }, [getStopUrl]);

    // -----------------------------------------------------------------------
    // Try to create audio graph (best-effort, after user gesture)
    // -----------------------------------------------------------------------
    const tryCreateGraph = useCallback(() => {
      if (graphCreatedRef.current || !audioRef.current) return;
      graphCreatedRef.current = true;

      // Only create Web Audio graph when HLS.js is active (blob: URLs are same-origin).
      // For native playback (Safari HLS, direct files), the source is cross-origin
      // from Bunny CDN. Without crossOrigin="anonymous" on the element,
      // createMediaElementSource() triggers a CORS hard-mute — the browser
      // silences the element entirely at the hardware level.
      // In that case, skip graph creation → canvas falls back to ambient mode.
      if (!hlsRef.current) return;

      const graph = createPlaybackAudioGraph(audioRef.current);
      graphRef.current = graph;

      // If AudioContext is suspended (iOS), try to resume
      if (graph && graph.audioContext.state === 'suspended') {
        graph.audioContext.resume().catch(() => {});
      }
    }, []);

    const clearLoadingGuard = useCallback(() => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    }, []);

    const enterTerminalError = useCallback((
      status: 'error' | 'unsupported' | 'blocked',
      message: string,
      title?: string
    ) => {
      // Deduplication: don't overwrite existing terminal error/unsupported
      // Allow blocked → error (more precise info)
      const s = stateRef.current.status;
      if (s === 'error' || s === 'unsupported') return;

      clearLoadingGuard();
      abortRef.current?.abort();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      stopPlayEvent();

      if (status === 'error') {
        emitState({ status: 'error', message });
      } else if (status === 'unsupported') {
        emitState({ status: 'unsupported', message });
      } else {
        emitState({ status: 'blocked', title: title ?? '', message });
      }
    }, [clearLoadingGuard, emitState, stopPlayEvent]);

    // -----------------------------------------------------------------------
    // Load audio (initial + refresh)
    // -----------------------------------------------------------------------
    const loadAudio = useCallback(async (isRefresh = false, isRetry = false) => {
      const deviceId = deviceIdRef.current;
      clearLoadingGuard();

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (!isRefresh && !isRetry) {
        retryCountRef.current = 0;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      attemptIdRef.current += 1;
      const currentAttempt = attemptIdRef.current;
      const isStale = () => attemptIdRef.current !== currentAttempt;

      const triggerRetry = (errMsg: string) => {
        if (retryCountRef.current < 1) {
          retryCountRef.current += 1;
          emitState(isRefresh ? { status: 'refreshing' } : { status: 'loading' });
          retryTimeoutRef.current = setTimeout(() => loadAudio(isRefresh, true), 1000);
        } else {
          enterTerminalError('error', errMsg);
        }
      };

      // Save state for refresh restore
      let snapshot: AudioSnapshot | null = null;
      if (isRefresh && audioRef.current) {
        snapshot = {
          currentTime: audioRef.current.currentTime,
          duration: normalizeDuration(audioRef.current.duration),
          paused: audioRef.current.paused,
          volume: audioRef.current.volume,
          muted: audioRef.current.muted,
        };
        emitState({ status: 'refreshing' });
      } else {
        emitState({ status: 'loading' });
        loadingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current.status === 'loading') {
            enterTerminalError('error', 'Nie udało się załadować nagrania — przekroczono limit czasu.');
          }
        }, 15000);
      }

      // Fetch resume position (only on first load, not refresh/retry, and only if enabled)
      const playPositionUrl = getPlayPositionUrl();
      if (!isRefresh && !isRetry && !resumeFetchedRef.current && playPositionUrl !== null) {
        resumeFetchedRef.current = true;
        try {
          const resumeRes = await fetch(
            `${playPositionUrl}?${idFieldName}=${encodeURIComponent(playbackId)}`,
            { signal: abortRef.current.signal },
          );
          if (!isStale()) {
            const resumeData = await resumeRes.json().catch(() => ({ position: 0 }));
            if (resumeData.position > 0) {
              resumePositionRef.current = resumeData.position;
            }
          }
        } catch {
          // Non-blocking — resume is best-effort
        }
      } else if (!isRefresh && !isRetry && !resumeFetchedRef.current && playPositionUrl === null) {
        // Mark as fetched so we never try (disabled)
        resumeFetchedRef.current = true;
      }

      try {
        // Build token request body (custom builder or default)
        const requestBody = tokenRequestBuilderRef.current
          ? tokenRequestBuilderRef.current(deviceId)
          : { [idFieldName]: playbackId, deviceId };

        const res = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortRef.current.signal,
        });

        if (isStale()) return;

        const data = await res.json().catch(() => ({}));
        if (isStale()) return;

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            enterTerminalError('error', data.error || 'Błąd dostępu');
          } else if (res.status >= 500) {
            triggerRetry(data.error || 'Błąd serwera podczas wczytywania nagrania');
          } else {
            enterTerminalError('error', data.error || 'Błąd serwera');
          }
          return;
        }

        if (!data.allowed) {
          if (data.title) {
            enterTerminalError('blocked', data.message || '', data.title);
          } else {
            enterTerminalError('error', data.message || 'Brak dostępu');
          }
          return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        // Clean up previous attempt listeners and sources
        if (loadedMetadataHandlerRef.current) {
          audio.removeEventListener('loadedmetadata', loadedMetadataHandlerRef.current);
          loadedMetadataHandlerRef.current = null;
        }
        if (errorHandlerRef.current) {
          audio.removeEventListener('error', errorHandlerRef.current);
          errorHandlerRef.current = null;
        }

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // Clear native source and any <source> children to stop ongoing downloads
        audio.removeAttribute('src');
        while (audio.firstChild) audio.removeChild(audio.firstChild);
        audio.load();

        const onSourceReady = () => {
          if (isStale()) return;
          if (loadedMetadataHandlerRef.current) {
            audio.removeEventListener('loadedmetadata', loadedMetadataHandlerRef.current);
          }
          retryCountRef.current = 0;
          clearLoadingGuard();
          // NOTE: Do NOT call tryCreateGraph() here.
          // createMediaElementSource() hijacks audio output from the element,
          // routing it exclusively through the AudioContext graph.
          // If AudioContext is suspended (no user gesture yet), audio is silenced.
          // Graph creation is deferred to play() which runs inside a user gesture.
          emitDuration();

          const range = playbackRangeRef.current;

          if (snapshot) {
            // Token refresh: restore position from snapshot
            audio.currentTime = snapshot.currentTime;
            audio.volume = snapshot.volume;
            audio.muted = snapshot.muted;
            emitTime(snapshot.currentTime);
            if (!snapshot.paused) {
              audio.play().catch(() => {
                emitState({ status: 'paused' });
              });
              return;
            }
          } else if (range) {
            // Fragment playback: seek to startSec, ignore resume position
            audio.currentTime = range.startSec;
            emitTime(range.startSec);
          } else if (resumePositionRef.current && resumePositionRef.current > 0) {
            // Full session resume from last saved position (first load only)
            audio.currentTime = resumePositionRef.current;
            emitTime(resumePositionRef.current);
            resumePositionRef.current = null; // Only apply once
          }
          emitState({ status: 'paused' });
        };

        const handleNativeError = () => {
          if (isStale()) return;
          if (hlsRef.current) {
            console.warn('[AudioEngine] video error while HLS active, code:', audio.error?.code);
            return;
          }
          const code = audio.error?.code;
          if (code === 4) {
            // Auto-retry once before giving up — Safari often fails on first request
            // for extensionless files (CDN returns application/octet-stream on cache miss).
            triggerRetry('Problemy z formatem nagrania, ponawianie...');
          } else if (code === 2) {
            triggerRetry('Błąd sieci podczas odtwarzania.');
          } else {
            enterTerminalError('error', `Błąd elementu media (kod ${code ?? '?'})`);
          }
        };

        errorHandlerRef.current = handleNativeError;
        audio.addEventListener('error', handleNativeError);
        loadedMetadataHandlerRef.current = onSourceReady;

        // Setup source
        if (data.deliveryType === 'hls' && Hls.isSupported()) {
          // HLS.js path (Chrome, Firefox, etc.)
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          });
          // Register handlers BEFORE loadSource/attachMedia to prevent race conditions
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (isStale()) return;
            onSourceReady();
          });
          hls.on(Hls.Events.ERROR, (_, errData) => {
            if (isStale()) return;
            if (errData.fatal) {
              console.warn('[AudioEngine] HLS fatal:', errData.type, errData.details);
              enterTerminalError('error', 'Błąd odtwarzania strumienia.');
              return;
            }
            if (errData.type === Hls.ErrorTypes.NETWORK_ERROR || process.env.NODE_ENV !== 'production') {
              console.warn('[AudioEngine] HLS non-fatal:', errData.type, errData.details);
            }
          });
          hls.loadSource(data.url);
          hls.attachMedia(audio);
          hlsRef.current = hls;
        } else if (audio.canPlayType('application/vnd.apple.mpegurl') || data.deliveryType === 'direct') {
          // Safari native HLS or direct file.
          // Use a <source> child element so we can pass an explicit type attribute.
          // Without it, Safari must sniff format from CDN Content-Type headers;
          // extensionless files often get application/octet-stream on cache miss → code 4.
          const srcEl = document.createElement('source');
          srcEl.src = data.url;
          if (data.mimeType) srcEl.type = data.mimeType;
          audio.appendChild(srcEl);
          audio.load();
          audio.addEventListener('loadedmetadata', onSourceReady);
        } else {
          enterTerminalError('unsupported', 'Twoja przeglądarka nie obsługuje tego formatu nagrania.');
          return;
        }

        // Schedule token refresh
        if (refreshRef.current) clearTimeout(refreshRef.current);
        const refreshIn = ((data.expiresIn || 900) - 60) * 1000;
        refreshRef.current = setTimeout(() => {
          loadingTimeoutRef.current = setTimeout(() => {
            if (stateRef.current.status === 'refreshing') {
              enterTerminalError('error', 'Nie udało się odświeżyć nagrania.');
            }
          }, 15000); // 15s refresh guard
          loadAudio(true);
        }, refreshIn);
      } catch (err: any) {
        if (err?.name === 'AbortError' || isStale()) return;
        triggerRetry('Nie udało się załadować nagrania.');
      }
    }, [playbackId, idFieldName, tokenEndpoint, emitState, emitTime, emitDuration, clearLoadingGuard, enterTerminalError, getPlayPositionUrl]);

    // -----------------------------------------------------------------------
    // Audio event handlers
    // -----------------------------------------------------------------------
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      deviceIdRef.current = getDeviceId();

      // Detect volume capability
      try {
        const orig = audio.volume;
        audio.volume = 0.5;
        canSetVolumeRef.current = audio.volume === 0.5;
        audio.volume = orig;
      } catch {
        canSetVolumeRef.current = false;
      }

      const heartbeatFn = async () => {
        try {
          const deviceId = deviceIdRef.current;
          // 1. Concurrent stream check
          const hbRes = await fetch(getHeartbeatUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
          });
          const hbData = await hbRes.json().catch(() => ({}));
          if (!hbData.allowed) {
            audio.pause();
            enterTerminalError('blocked', hbData.message || 'Odtwarzasz już nagranie na innym urządzeniu.', hbData.title ?? 'Odtwarzanie na innym urządzeniu');
            return;
          }

          // 2. Play position heartbeat (disabled when playPosition endpoint is null)
          const posUrl = getPlayPositionUrl();
          if (posUrl !== null && !audio.paused && audio.currentTime > 0) {
            fetch(posUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                playEventId: playEventIdRef.current,
                [idFieldName]: playbackId,
                positionSeconds: Math.floor(audio.currentTime),
                totalDurationSeconds: normalizeDuration(audio.duration) ?? undefined,
              }),
            }).catch(() => {});
          }
        } catch {}
      };

      const onPlaying = () => {
        clearLoadingGuard();
        emitState({ status: 'playing' });

        // Play-event: open new event if none exists
        if (!playEventIdRef.current) {
          playStartRef.current = Date.now();
          // Derive session_type: explicit analyticsContext > fallback from idFieldName
          const sessionType: AnalyticsContext =
            analyticsContextRef.current ??
            (idFieldName === 'recordingId' ? 'recording' : 'vod');

          fetch(getPlayEventUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              sessionId: playbackId,
              sessionType,
              deviceId: deviceIdRef.current,
            }),
          })
            .then(r => r.json())
            .then(d => { if (d.eventId) playEventIdRef.current = d.eventId; })
            .catch(() => {});
        }

        // Heartbeat: clear old, start new
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(heartbeatFn, 30000);
      };

      const onPause = () => {
        if (stateRef.current.status === 'blocked') return;
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        stopPlayEvent(); // Close play-event on pause
        emitState({ status: 'paused' });
      };

      const onEnded = () => {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        stopPlayEvent(); // Close play-event on end
        emitState({ status: 'ended' });
      };

      const onTimeUpdate = () => {
        const t = audio.currentTime;
        emitTime(t);

        // Fragment boundary check
        const range = playbackRangeRef.current;
        if (range && t >= range.endSec) {
          audio.pause();
          // Notify fragment subscribers (radio → trigger next fragment)
          fragmentListeners.current.forEach(cb => cb());
        }
      };

      const onDurationChange = () => emitDuration();

      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('durationchange', onDurationChange);

      // Initial load
      loadAudio(false);

      return () => {
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('durationchange', onDurationChange);

        abortRef.current?.abort();
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        if (loadedMetadataHandlerRef.current) audio.removeEventListener('loadedmetadata', loadedMetadataHandlerRef.current);
        if (errorHandlerRef.current) audio.removeEventListener('error', errorHandlerRef.current);

        clearLoadingGuard();
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (refreshRef.current) clearTimeout(refreshRef.current);
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if (hlsRef.current) hlsRef.current.destroy();
        if (graphRef.current) graphRef.current.cleanup();
        stopPlayEvent();
        stopStream();
      };
    }, [loadAudio, emitState, emitTime, emitDuration, stopPlayEvent, stopStream, clearLoadingGuard, enterTerminalError, idFieldName, playbackId, getHeartbeatUrl, getPlayPositionUrl, getPlayEventUrl]);

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------
    useImperativeHandle(ref, () => ({
      play() {
        const audio = audioRef.current;
        if (!audio) return;
        // Create audio graph on user gesture — this is the only safe moment
        // because createMediaElementSource() hijacks audio output and
        // AudioContext.resume() requires a user gesture to succeed.
        tryCreateGraph();
        const ctx = graphRef.current?.audioContext;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {
            // Resume failed — graph hijacked audio but can't output.
            // Destroy graph so audio routes directly to speakers.
            if (graphRef.current) {
              graphRef.current.cleanup();
              graphRef.current = null;
            }
          });
        }
        audio.play().catch(() => {});
      },
      pause() {
        audioRef.current?.pause();
      },
      seek(time: number) {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = time;
        emitTime(time); // Immediate emit after seek
      },
      setVolume(v: number) {
        if (audioRef.current) audioRef.current.volume = v;
      },
      setMuted(m: boolean) {
        if (audioRef.current) audioRef.current.muted = m;
      },
      setPlaybackRate(rate: number) {
        if (audioRef.current) audioRef.current.playbackRate = rate;
      },
      requestFullscreen() {
        const el = containerRef.current;
        if (!el) return;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
      },
      exitFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      },
      getSnapshot(): AudioSnapshot {
        const audio = audioRef.current;
        if (!audio) {
          return { currentTime: 0, duration: null, paused: true, volume: 1, muted: false };
        }
        return {
          currentTime: audio.currentTime,
          duration: normalizeDuration(audio.duration),
          paused: audio.paused,
          volume: audio.volume,
          muted: audio.muted,
        };
      },
      getAnalyser(): AnalyserNode | null {
        return graphRef.current?.analyser ?? null;
      },
      get canSetVolume() {
        return canSetVolumeRef.current;
      },
      subscribeToTime(cb: (t: number) => void) {
        timeListeners.current.add(cb);
        // Immediate emit
        if (audioRef.current) cb(audioRef.current.currentTime);
        return () => { timeListeners.current.delete(cb); };
      },
      subscribeToDuration(cb: (d: number | null) => void) {
        durationListeners.current.add(cb);
        // Immediate emit
        if (audioRef.current) cb(normalizeDuration(audioRef.current.duration));
        return () => { durationListeners.current.delete(cb); };
      },
      // ── PR 6 additions ──────────────────────────────────────────────────────
      setPlaybackRange(range: { startSec: number; endSec: number } | null) {
        playbackRangeRef.current = range;
        // If a new range is set imperatively, seek to its startSec immediately
        if (range && audioRef.current) {
          audioRef.current.currentTime = range.startSec;
          emitTime(range.startSec);
        }
      },
      fadeIn(durationMs: number) {
        const audio = audioRef.current;
        if (!audio) return;
        // Clear any in-flight fade
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        const targetVolume = preFadeVolumeRef.current;
        audio.volume = 0;
        const steps = Math.max(1, Math.round(durationMs / 50));
        const stepSize = targetVolume / steps;
        let step = 0;
        fadeIntervalRef.current = setInterval(() => {
          step++;
          if (!audioRef.current) {
            clearInterval(fadeIntervalRef.current!);
            fadeIntervalRef.current = null;
            return;
          }
          audioRef.current.volume = Math.min(targetVolume, stepSize * step);
          if (step >= steps) {
            clearInterval(fadeIntervalRef.current!);
            fadeIntervalRef.current = null;
          }
        }, 50);
      },
      fadeOut(durationMs: number) {
        const audio = audioRef.current;
        if (!audio) return;
        // Save current volume as the target for any subsequent fadeIn
        preFadeVolumeRef.current = audio.volume;
        // Clear any in-flight fade
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        const startVolume = audio.volume;
        const steps = Math.max(1, Math.round(durationMs / 50));
        const stepSize = startVolume / steps;
        let step = 0;
        fadeIntervalRef.current = setInterval(() => {
          step++;
          if (!audioRef.current) {
            clearInterval(fadeIntervalRef.current!);
            fadeIntervalRef.current = null;
            return;
          }
          audioRef.current.volume = Math.max(0, startVolume - stepSize * step);
          if (step >= steps) {
            clearInterval(fadeIntervalRef.current!);
            fadeIntervalRef.current = null;
            audioRef.current?.pause();
          }
        }, 50);
      },
      subscribeToFragment(cb: () => void) {
        fragmentListeners.current.add(cb);
        return () => { fragmentListeners.current.delete(cb); };
      },
    }), [emitTime, tryCreateGraph]);

    // -----------------------------------------------------------------------
    // Render hidden audio element
    // -----------------------------------------------------------------------
    return (
      <video
        ref={audioRef}
        playsInline
        preload="auto"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
    );
  },
);
