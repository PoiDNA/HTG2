'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import Hls from 'hls.js';

// ─────────────────────────────────────────────────────────────────────────────
// FragmentRadioEngine — dedicated, minimal audio engine for Radio Momentów.
//
// Why this exists (vs. reusing AudioEngine):
//   AudioEngine was designed for full-session VOD review: resume position,
//   15-minute token refresh, concurrent-stream heartbeat returning {allowed},
//   Web Audio graph for analyser/visualiser. Fragment radio reused it through
//   a dozen prop overrides, which repeatedly produced silent-failure bugs
//   (e.g. fragment-heartbeat returning {ok:true} without `allowed` → terminal
//   "blocked" state at t=30s on every fragment).
//
// This engine has exactly one job: play a single fragment (HLS or direct),
// seek to startSec, stop at endSec, call onEnded. No heartbeat, no
// play-position, no Web Audio graph. Radio orchestration (bumper, next-fetch,
// state machine) stays in RadioPlayer — this is only the media pipeline.
//
// Lifecycle:
//   prop `save` changes  → tear down previous stream → fetch fresh token →
//   attach HLS or set audio.src → seek to startSec on loadedmetadata → play.
//   prop `save` becomes null → tear down + call /api/video/fragment-stop.
// ─────────────────────────────────────────────────────────────────────────────

export interface FragmentRadioSave {
  saveId: string;
  startSec: number;
  endSec: number;
  /** Session title for MediaSession metadata + retries */
  sessionTitle: string;
  /** Fragment-level title (custom_title or time range) */
  fragmentTitle: string;
  /** Optional share-token scenario (not used today, reserved for future) */
  shareToken?: string;
}

export interface FragmentRadioEngineProps {
  /** Current fragment to play. null = stop + clean up active_streams. */
  save: FragmentRadioSave | null;
  /** Master volume 0–1. Applied directly to the <audio> element. */
  volume?: number;
  /** Called when metadata has loaded and audio has seeked to startSec. */
  onReady?: () => void;
  /** Called on 'playing' event (audio element actually emitting sound). */
  onPlaying?: () => void;
  /** Called on 'pause' event (user paused or stream pause). */
  onPause?: () => void;
  /**
   * Called when the fragment reaches endSec (via timeupdate boundary check
   * OR natural 'ended' event — whichever fires first). The engine auto-pauses
   * the audio element before firing this; the parent should orchestrate the
   * next fragment swap.
   */
  onEnded?: () => void;
  /** Called on any fatal error. Message is user-facing Polish. */
  onError?: (message: string) => void;
  /** Called with current playback position for progress bar (throttled by audio element). */
  onTimeUpdate?: (currentSec: number, durationSec: number) => void;
}

export interface FragmentRadioEngineHandle {
  play: () => Promise<void>;
  pause: () => void;
  /**
   * Stop playback + call /api/video/fragment-stop to release the
   * active_streams slot. Called by RadioPlayer on unmount / stop button.
   */
  stop: () => Promise<void>;
}

interface TokenResponse {
  allowed: boolean;
  url?: string;
  deliveryType?: 'hls' | 'direct';
  mimeType?: string | null;
  expiresIn?: number;
  startSec?: number;
  endSec?: number;
  title?: string;
  message?: string;
}

/** Stable device id per-tab (reused across fragments). */
function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'htg-device-id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export const FragmentRadioEngine = forwardRef<
  FragmentRadioEngineHandle,
  FragmentRadioEngineProps
>(function FragmentRadioEngine(
  { save, volume = 1, onReady, onPlaying, onPause, onEnded, onError, onTimeUpdate },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Monotonic attempt counter to ignore late async results from stale saves. */
  const attemptRef = useRef(0);
  /** Last active device id (for fragment-stop). */
  const deviceIdRef = useRef('');
  /** Ref to current save range for event handlers (avoids stale closure). */
  const rangeRef = useRef<{ startSec: number; endSec: number } | null>(null);
  /** Guards onEnded — fire at most once per save. */
  const endedFiredRef = useRef(false);

  // Stable callbacks via refs so effect doesn't re-run when parent rerenders
  const cbRef = useRef({ onReady, onPlaying, onPause, onEnded, onError, onTimeUpdate });
  useEffect(() => {
    cbRef.current = { onReady, onPlaying, onPause, onEnded, onError, onTimeUpdate };
  });

  const [, forceRender] = useState(0);
  void forceRender; // satisfy linter — we only use it via state updates

  const teardown = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); } catch { /* ignore */ }
    }
  }, []);

  const fetchTokenAndAttach = useCallback(async (s: FragmentRadioSave, myAttempt: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const deviceId = getDeviceId();
    deviceIdRef.current = deviceId;

    const abort = new AbortController();
    abortRef.current = abort;

    let token: TokenResponse;
    try {
      const res = await fetch('/api/video/fragment-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveId: s.saveId,
          deviceId,
          radio: true,
          ...(s.shareToken ? { shareToken: s.shareToken } : {}),
        }),
        signal: abort.signal,
      });
      token = await res.json();
    } catch (err) {
      if (myAttempt !== attemptRef.current) return; // stale
      if ((err as Error).name === 'AbortError') return;
      cbRef.current.onError?.('Nie udało się pobrać tokenu.');
      return;
    }

    // Stale check: user clicked "next" before token arrived
    if (myAttempt !== attemptRef.current) return;

    if (!token.allowed || !token.url) {
      cbRef.current.onError?.(token.message ?? 'Moment niedostępny.');
      return;
    }

    rangeRef.current = { startSec: s.startSec, endSec: s.endSec };
    endedFiredRef.current = false;

    // Attach media — HLS.js for Chromium; native <audio> for Safari/direct.
    const useHls = token.deliveryType === 'hls' && Hls.isSupported();
    if (useHls) {
      const hls = new Hls({
        // Minimal config — short clips don't need aggressive buffering.
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(token.url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (myAttempt !== attemptRef.current) return;
        if (data.fatal) {
          // Fatal HLS error → fire onError, parent will advance.
          cbRef.current.onError?.('Błąd odtwarzania strumienia.');
        }
      });
    } else {
      // Native (Safari HLS or direct MP3/AAC)
      audio.src = token.url;
    }
  }, []);

  // Main effect — react to save changes
  useEffect(() => {
    attemptRef.current += 1;
    const myAttempt = attemptRef.current;
    teardown();

    if (!save) return;

    fetchTokenAndAttach(save, myAttempt);

    // No cleanup here beyond teardown on next save change — teardown on unmount
    // is handled by the unmount-only effect below so we don't double-destroy.
  }, [save, teardown, fetchTokenAndAttach]);

  // Unmount-only cleanup: teardown + release active_streams slot
  useEffect(() => {
    return () => {
      teardown();
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      // Fire-and-forget — stop endpoint is idempotent.
      // Use keepalive so the request survives page navigation.
      try {
        fetch('/api/video/fragment-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, streamContext: 'fragment_radio' }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    };
  }, [teardown]);

  // Volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  // Audio element event wiring
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const r = rangeRef.current;
      if (r && isFinite(audio.duration)) {
        try { audio.currentTime = r.startSec; } catch { /* ignore */ }
      }
      cbRef.current.onReady?.();
      // Try to start playback immediately — if autoplay is blocked the parent
      // can show a "press play" state via onError path, but in our flow the
      // first play() is always user-gesture-driven (RadioPlayer start button),
      // so subsequent token refreshes inherit the same activation.
      audio.play().catch(() => {
        // Autoplay blocked. Parent handles — user will click play.
      });
    };
    const onPlayingEvt = () => {
      cbRef.current.onPlaying?.();
      updateMediaSession();
    };
    const onPauseEvt = () => cbRef.current.onPause?.();
    const onEndedEvt = () => {
      if (endedFiredRef.current) return;
      endedFiredRef.current = true;
      cbRef.current.onEnded?.();
    };
    const onTimeUpdateEvt = () => {
      const r = rangeRef.current;
      const t = audio.currentTime;
      cbRef.current.onTimeUpdate?.(t, audio.duration);
      if (r && t >= r.endSec && !endedFiredRef.current) {
        endedFiredRef.current = true;
        try { audio.pause(); } catch { /* ignore */ }
        cbRef.current.onEnded?.();
      }
    };
    const onErrorEvt = () => {
      cbRef.current.onError?.('Błąd audio.');
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('playing', onPlayingEvt);
    audio.addEventListener('pause', onPauseEvt);
    audio.addEventListener('ended', onEndedEvt);
    audio.addEventListener('timeupdate', onTimeUpdateEvt);
    audio.addEventListener('error', onErrorEvt);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('playing', onPlayingEvt);
      audio.removeEventListener('pause', onPauseEvt);
      audio.removeEventListener('ended', onEndedEvt);
      audio.removeEventListener('timeupdate', onTimeUpdateEvt);
      audio.removeEventListener('error', onErrorEvt);
    };
  }, []);

  // MediaSession API — lock-screen controls, media keys
  const updateMediaSession = useCallback(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!save) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: save.fragmentTitle,
        artist: save.sessionTitle,
        album: 'Radio Momentów',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        // Force end → RadioPlayer's onEnded advances
        if (!endedFiredRef.current) {
          endedFiredRef.current = true;
          cbRef.current.onEnded?.();
        }
      });
    } catch { /* ignore */ }
  }, [save]);

  // Tab visibility — nudge play when returning to foreground if audio stalled.
  useEffect(() => {
    const handler = () => {
      if (document.hidden) return;
      const audio = audioRef.current;
      if (!audio) return;
      // If the element thinks it should be playing but is stalled, retry.
      if (audio.paused && save && !endedFiredRef.current && audio.readyState >= 2) {
        audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [save]);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    play: async () => {
      const audio = audioRef.current;
      if (!audio) return;
      try { await audio.play(); } catch { /* ignore */ }
    },
    pause: () => {
      audioRef.current?.pause();
    },
    stop: async () => {
      attemptRef.current += 1;
      teardown();
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      try {
        await fetch('/api/video/fragment-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, streamContext: 'fragment_radio' }),
          keepalive: true,
        });
      } catch { /* ignore */ }
    },
  }), [teardown]);

  // Hidden audio element — RadioPlayer provides the visible UI
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={audioRef}
      preload="auto"
      playsInline
      // Bunny CDN may serve cross-origin; required for native HLS on Safari
      crossOrigin="anonymous"
      style={{ display: 'none' }}
    />
  );
});
