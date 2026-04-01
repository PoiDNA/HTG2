'use client';

// ---------------------------------------------------------------------------
// AudioEngine — FULL playback lifecycle for booking recording audio
//
// Manages: <audio> element, HLS.js/Safari native/direct file, token fetch,
// token refresh (reload + restore), heartbeat, play-event, play-position,
// concurrent streams, cleanup. Audio analysis graph is best-effort optional.
//
// Exposes an imperative handle (no raw DOM) + discriminated PlayerState.
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

export interface AudioEngineHandle {
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  getSnapshot(): AudioSnapshot;
  getAnalyser(): AnalyserNode | null;
  readonly canSetVolume: boolean;
  subscribeToTime(cb: (t: number) => void): () => void;
  subscribeToDuration(cb: (d: number | null) => void): () => void;
}

interface AudioEngineProps {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  tokenEndpoint: string;
  onStateChange: (state: PlayerState) => void;
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
  function AudioEngine({ playbackId, idFieldName, tokenEndpoint, onStateChange }, ref) {
    const audioRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const graphRef = useRef<PlaybackAudioGraph | null>(null);
    const graphCreatedRef = useRef(false);

    const deviceIdRef = useRef('');
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playEventIdRef = useRef<string | null>(null);
    const playStartRef = useRef(0);

    // Subscription sets
    const timeListeners = useRef(new Set<(t: number) => void>());
    const durationListeners = useRef(new Set<(d: number | null) => void>());

    // Capability detection
    const canSetVolumeRef = useRef(true);

    // Current state ref for internal reads (avoids stale closures)
    const stateRef = useRef<PlayerState>({ status: 'loading' });

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
    // Stop stream (cleanup)
    // -----------------------------------------------------------------------
    const stopPlayEvent = useCallback(() => {
      if (playEventIdRef.current) {
        const duration = Math.floor((Date.now() - playStartRef.current) / 1000);
        fetch('/api/video/play-event', {
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
    }, []);

    const stopStream = useCallback(() => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      try {
        fetch('/api/video/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId }),
        });
      } catch {}
    }, []);

    // -----------------------------------------------------------------------
    // Try to create audio graph (best-effort, after user gesture)
    // -----------------------------------------------------------------------
    const tryCreateGraph = useCallback(() => {
      if (graphCreatedRef.current || !audioRef.current) return;
      graphCreatedRef.current = true;

      const graph = createPlaybackAudioGraph(audioRef.current);
      graphRef.current = graph;

      // If AudioContext is suspended (iOS), try to resume
      if (graph && graph.audioContext.state === 'suspended') {
        graph.audioContext.resume().catch(() => {});
      }
    }, []);

    // -----------------------------------------------------------------------
    // Load audio (initial + refresh)
    // -----------------------------------------------------------------------
    const loadAudio = useCallback(async (isRefresh = false) => {
      const deviceId = deviceIdRef.current;

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
      }

      try {
        const res = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [idFieldName]: playbackId, deviceId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          emitState({ status: 'error', message: data.error || 'Błąd serwera' });
          return;
        }

        if (!data.allowed) {
          if (data.title) {
            emitState({ status: 'blocked', title: data.title, message: data.message || '' });
          } else {
            emitState({ status: 'error', message: data.message || 'Brak dostępu' });
          }
          return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        // Capability check for unsupported direct files
        if (data.deliveryType === 'direct' && data.mimeType) {
          const canPlay = audio.canPlayType(data.mimeType);
          if (canPlay === '') {
            emitState({
              status: 'unsupported',
              message: 'Format nagrania nie jest obsługiwany przez tę przeglądarkę.',
            });
            return;
          }
        }

        // Cleanup previous HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // Setup source
        if (data.deliveryType === 'hls' && Hls.isSupported()) {
          // HLS.js path (Chrome, Firefox, etc.)
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          });
          hls.loadSource(data.url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Create audio graph on first play gesture
            tryCreateGraph();
            if (snapshot && !snapshot.paused) {
              audio.play().catch(() => {});
            } else if (!isRefresh) {
              // Don't autoplay on initial load — wait for user gesture
            }
          });
          hls.on(Hls.Events.ERROR, (_, errData) => {
            if (errData.fatal) {
              emitState({ status: 'error', message: 'Błąd odtwarzania strumienia.' });
            }
          });
          hlsRef.current = hls;
        } else if (audio.canPlayType('application/vnd.apple.mpegurl') || data.deliveryType === 'direct') {
          // Safari native HLS or direct file
          audio.src = data.url;
          audio.addEventListener('loadedmetadata', () => {
            tryCreateGraph();
            emitDuration();
            if (snapshot && !snapshot.paused) {
              audio.play().catch(() => {});
            }
          }, { once: true });
        }

        // Restore state after refresh
        if (snapshot) {
          const restoreOnce = () => {
            audio.currentTime = snapshot!.currentTime;
            audio.volume = snapshot!.volume;
            audio.muted = snapshot!.muted;
            emitTime(snapshot!.currentTime);
            audio.removeEventListener('loadedmetadata', restoreOnce);
          };
          audio.addEventListener('loadedmetadata', restoreOnce);
        }

        // Start play event logging (non-refresh only)
        if (!isRefresh) {
          playStartRef.current = Date.now();
          fetch('/api/video/play-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              [idFieldName]: playbackId,
              sessionType: idFieldName === 'recordingId' ? 'booking_recording' : 'vod',
              deviceId,
            }),
          })
            .then(r => r.json())
            .then(d => { if (d.eventId) playEventIdRef.current = d.eventId; })
            .catch(() => {});
        }

        // Start heartbeat
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(async () => {
          try {
            // 1. Concurrent stream check
            const hbRes = await fetch('/api/video/heartbeat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId }),
            });
            const hbData = await hbRes.json().catch(() => ({}));
            if (!hbData.allowed) {
              audio.pause();
              emitState({
                status: 'blocked',
                title: hbData.title ?? 'Odtwarzanie na innym urządzeniu',
                message: hbData.message || 'Odtwarzasz już nagranie na innym urządzeniu.',
              });
              return;
            }

            // 2. Play position heartbeat (fire-and-forget)
            if (!audio.paused && audio.currentTime > 0) {
              fetch('/api/video/play-position', {
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
        }, 30000);

        // Schedule token refresh
        if (refreshRef.current) clearTimeout(refreshRef.current);
        const refreshIn = ((data.expiresIn || 900) - 60) * 1000;
        refreshRef.current = setTimeout(() => {
          loadAudio(true);
        }, refreshIn);
      } catch {
        emitState({ status: 'error', message: 'Nie udało się załadować nagrania.' });
      }
    }, [playbackId, idFieldName, tokenEndpoint, emitState, emitTime, emitDuration, tryCreateGraph]);

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

      const onPlaying = () => {
        if (stateRef.current.status === 'refreshing') return; // don't override refreshing
        emitState({ status: 'playing' });
      };
      const onPause = () => {
        if (stateRef.current.status === 'refreshing') return;
        if (stateRef.current.status === 'blocked') return;
        emitState({ status: 'paused' });
      };
      const onEnded = () => emitState({ status: 'ended' });
      const onTimeUpdate = () => emitTime(audio.currentTime);
      const onDurationChange = () => emitDuration();
      const onLoadedMetadata = () => emitDuration();

      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('durationchange', onDurationChange);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);

      // Initial load
      loadAudio(false);

      return () => {
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('durationchange', onDurationChange);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);

        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (refreshRef.current) clearTimeout(refreshRef.current);
        if (hlsRef.current) hlsRef.current.destroy();
        if (graphRef.current) graphRef.current.cleanup();
        stopPlayEvent();
        stopStream();
      };
    }, [loadAudio, emitState, emitTime, emitDuration, stopPlayEvent, stopStream]);

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------
    useImperativeHandle(ref, () => ({
      play() {
        const audio = audioRef.current;
        if (!audio) return;
        tryCreateGraph(); // Ensure graph is created on user gesture
        if (graphRef.current?.audioContext?.state === 'suspended') {
          graphRef.current.audioContext.resume().catch(() => {});
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
    }), [emitTime, tryCreateGraph]);

    // -----------------------------------------------------------------------
    // Render hidden audio element
    // -----------------------------------------------------------------------
    return (
      <video
        ref={audioRef}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        style={{ display: 'none', width: 0, height: 0 }}
      />
    );
  },
);
