'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import Hls from 'hls.js';
import { Play, Pause, Loader2, AlertTriangle } from 'lucide-react';

/**
 * Odtwarzacz audio z falą wizualną dla narzędzia segmentacji Momentów.
 *
 * - Pobiera podpisany URL HLS z /api/admin/fragments/sessions/[sessionId]/audio-url
 * - HLS → <audio> przez hls.js; wavesurfer używa media element jako backendu
 * - Skrót Space: play/pause. Klik na falę: seek.
 * - Shift+drag na fali: zaznacz zakres → tworzy nowy Moment (prefill start/end/tytuł).
 * - Ref eksponuje seekTo/play/pause dla parenta (markowanie start/end).
 */

export interface SessionAudioPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (sec: number) => void;
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
}

interface Props {
  sessionId: string;
  /** Callback z bieżącym czasem (sec) podczas odtwarzania — ~10 Hz */
  onTimeUpdate?: (sec: number) => void;
  /** Czas całkowity sesji (sec) — raportowany po załadowaniu */
  onDurationReady?: (sec: number) => void;
  /** Callback: user wybrał zakres przez Shift+drag na fali (sec) */
  onRangeSelected?: (startSec: number, endSec: number) => void;
}

const SessionAudioPlayer = forwardRef<SessionAudioPlayerHandle, Props>(function SessionAudioPlayer(
  { sessionId, onTimeUpdate, onDurationReady, onRangeSelected },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const disableDragRef = useRef<(() => void) | null>(null);
  const shiftDownRef = useRef(false);
  const onRangeSelectedRef = useRef(onRangeSelected);

  useEffect(() => { onRangeSelectedRef.current = onRangeSelected; }, [onRangeSelected]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
    seekTo: (sec: number) => {
      if (audioRef.current) audioRef.current.currentTime = Math.max(0, sec);
    },
    play: () => audioRef.current?.play().catch(() => {}),
    pause: () => audioRef.current?.pause(),
    isPlaying: () => !!audioRef.current && !audioRef.current.paused,
  }), []);

  // ── Load audio URL + init wavesurfer + hls ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');
      setErrMsg(null);

      try {
        const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/audio-url`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const { url, deliveryType, peaksUrl } = (await res.json()) as {
          url: string;
          deliveryType: 'hls' | 'direct';
          peaksUrl: string | null;
        };
        if (cancelled) return;

        // Spróbuj pobrać wstępnie wygenerowane peaks (szybszy render fali).
        // Format akceptowany przez WaveSurfer: number[] | number[][].
        let peaks: number[][] | undefined;
        if (peaksUrl) {
          try {
            const pr = await fetch(peaksUrl);
            if (pr.ok) {
              const json = await pr.json();
              if (Array.isArray(json)) {
                peaks = Array.isArray(json[0]) ? (json as number[][]) : [json as number[]];
              } else if (Array.isArray((json as { data?: unknown }).data)) {
                const data = (json as { data: unknown[] }).data;
                peaks = Array.isArray(data[0]) ? (data as number[][]) : [data as number[]];
              }
            }
          } catch {
            // fallback: wavesurfer wygeneruje peaks z audio
          }
          if (cancelled) return;
        }

        const container = containerRef.current;
        if (!container) return;

        const audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audioRef.current = audio;

        if (deliveryType === 'hls') {
          // Safari plays m3u8 natively; inni potrzebują hls.js.
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(audio);
            hlsRef.current = hls;
          } else {
            audio.src = url;
          }
        } else {
          // Direct audio (HTG2 storage lub Private CDN) — sam plik.
          audio.src = url;
        }

        // Create wavesurfer using the media element so playback stays in sync
        const ws = WaveSurfer.create({
          container,
          waveColor: 'rgba(136, 170, 136, 0.4)',
          progressColor: 'rgb(136, 170, 136)',
          cursorColor: 'rgba(136, 170, 136, 0.9)',
          cursorWidth: 2,
          height: 64,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
          normalize: true,
          media: audio,
          peaks,
        });
        wsRef.current = ws;

        // Regions plugin — Shift+drag → range selection
        const regions = ws.registerPlugin(RegionsPlugin.create());
        regionsRef.current = regions;

        regions.on('region-created', (region: Region) => {
          // Called when user drags to create a new region via enableDragSelection
          // OR when we programmatically addRegion. Filter: only user-drag creates
          // have an id starting with "region-" (auto-generated). Our programmatic
          // regions use id="frag-<idx>".
          if (region.id.startsWith('frag-')) return;
          const start = region.start;
          const end = region.end;
          // Remove the transient region; parent will addFragment (which may add
          // a persistent region with id="frag-N").
          region.remove();
          if (end > start && onRangeSelectedRef.current) {
            onRangeSelectedRef.current(start, end);
          }
        });

        ws.on('ready', (d: number) => {
          if (cancelled) return;
          setDuration(d);
          setStatus('ready');
          onDurationReady?.(d);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));
        ws.on('timeupdate', (t: number) => {
          setCurrentTime(t);
          onTimeUpdate?.(t);
        });
        ws.on('error', () => {
          setStatus('error');
          setErrMsg('Nie udało się załadować audio');
        });
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setErrMsg(e instanceof Error ? e.message : 'Błąd');
      }
    }

    load();

    return () => {
      cancelled = true;
      disableDragRef.current?.();
      disableDragRef.current = null;
      regionsRef.current = null;
      wsRef.current?.destroy();
      wsRef.current = null;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audioRef.current = null;
    };
  }, [sessionId, onDurationReady, onTimeUpdate]);

  // ── Shift key → włącza drag-select na regions plugin ───────────────────────
  useEffect(() => {
    const enableDrag = () => {
      const regions = regionsRef.current;
      if (!regions || disableDragRef.current) return;
      disableDragRef.current = regions.enableDragSelection({
        color: 'rgba(136, 170, 136, 0.25)',
      });
    };
    const disableDrag = () => {
      disableDragRef.current?.();
      disableDragRef.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !shiftDownRef.current) {
        shiftDownRef.current = true;
        enableDrag();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftDownRef.current = false;
        disableDrag();
      }
    };
    const onBlur = () => {
      shiftDownRef.current = false;
      disableDrag();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      disableDrag();
    };
  }, []);

  // ── Space = play/pause (gdy fokus nie jest na inpucie) ─────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const el = document.activeElement;
      const isInput = el instanceof HTMLElement && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      );
      if (isInput) return;
      e.preventDefault();
      if (wsRef.current) wsRef.current.playPause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePlay = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={status !== 'ready'}
          className="w-10 h-10 flex items-center justify-center bg-htg-sage hover:bg-htg-sage/90 disabled:opacity-40 text-white rounded-full transition-colors shrink-0"
          title={isPlaying ? 'Pauza (Spacja)' : 'Odtwórz (Spacja)'}
        >
          {status === 'loading'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : isPlaying
              ? <Pause className="w-4 h-4 fill-white" />
              : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div ref={containerRef} className="w-full" />
        </div>

        <div className="text-xs font-mono text-htg-fg-muted tabular-nums shrink-0 w-24 text-right">
          {fmt(currentTime)} / {fmt(duration)}
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      <p className="text-[11px] text-htg-fg-muted">
        Spacja — play/pause · klik na falę — seek · S — start tu · E — koniec tu · Shift+drag — zaznacz zakres
      </p>
    </div>
  );
});

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default SessionAudioPlayer;
