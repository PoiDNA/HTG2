'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import Hls from 'hls.js';
import { Play, Pause, Loader2, AlertTriangle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { speakerColor, type SpeakerSegment } from '@/lib/speakers/client';

// ── Markery: tag → kolor (Tailwind bg class) ────────────────────────────────
// Wybieramy z pośród palety HTG + neutralnych kolorów Tailwind. Bez tagu → sage.
const TAG_COLOR: Record<string, string> = {
  relacje:     'bg-htg-lavender',
  lek:         'bg-indigo-400',
  cialo:       'bg-emerald-400',
  trauma:      'bg-red-400',
  granice:     'bg-amber-400',
  emocje:      'bg-pink-400',
  dziecinstwo: 'bg-sky-400',
  praca:       'bg-slate-400',
  sens:        'bg-htg-warm',
  strata:      'bg-fuchsia-400',
};
function markerColorFor(tag?: string): string {
  if (tag && TAG_COLOR[tag]) return TAG_COLOR[tag];
  return 'bg-htg-sage';
}

export interface MarkerFragment {
  id: string;
  start_sec: number;
  end_sec: number;
  tag?: string;
}

export interface MarkerSuggestion {
  id: string;
  startSec: number;
  endSec: number;
  title?: string;
}

/**
 * Odtwarzacz audio z falą wizualną dla narzędzia segmentacji Momentów.
 *
 * - Pobiera podpisany URL HLS z /api/admin/fragments/sessions/[sessionId]/audio-url
 * - HLS → <audio> przez hls.js; wavesurfer używa media element jako backendu
 * - Skrót Space: play/pause. Klik na falę: seek.
 * - Shift+drag na fali: zaznacz zakres → tworzy nowy Moment (prefill start/end/tytuł).
 * - Ref eksponuje seekTo/play/pause dla parenta (markowanie start/end).
 * - Blocki mówców renderowane są pod falą w tym samym scrollującym wrapperze,
 *   co gwarantuje fizyczną synchronizację po osi X przy zoomie (1×/2×/4×/8×/16×).
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
  /** Segmenty mówców do narysowania pod falą (zsynchronizowane z osią X). */
  speakerSegments?: SpeakerSegment[];
  /** Callback: user wybrał zakres przez Shift+drag na fali (sec) */
  onRangeSelected?: (startSec: number, endSec: number) => void;
  /** Zapisane Momenty — renderowane jako markery nad falą. */
  fragments?: MarkerFragment[];
  /** Aktualnie wybrany Moment — pełna opacity + draggable handles. */
  selectedFragmentId?: string | null;
  /** Sugestie AI — outline dashed, klik = akceptuj. */
  suggestions?: MarkerSuggestion[];
  /** Drag jednego z handle'y selected fragmentu — nowy zakres w sec. */
  onRangeEdit?: (fragmentId: string, startSec: number, endSec: number) => void;
  /** Klik w marker zapisanego fragmentu. */
  onFragmentClick?: (fragmentId: string) => void;
  /** Klik w sugestię AI. */
  onSuggestionAccept?: (id: string) => void;
  /** Odrzucenie sugestii AI. */
  onSuggestionReject?: (id: string) => void;
  /** Drag handle sugestii AI — nowy zakres w sec. */
  onSuggestionRangeEdit?: (id: string, startSec: number, endSec: number) => void;
  /** Klik w tło markera sugestii — seek+play od początku sugestii. */
  onSuggestionClick?: (startSec: number) => void;
}

const ZOOM_STEPS = [1, 2, 4, 8, 16] as const;

const SessionAudioPlayer = forwardRef<SessionAudioPlayerHandle, Props>(function SessionAudioPlayer(
  {
    sessionId,
    onTimeUpdate,
    onDurationReady,
    speakerSegments,
    onRangeSelected,
    fragments,
    selectedFragmentId,
    suggestions,
    onRangeEdit,
    onFragmentClick,
    onSuggestionAccept,
    onSuggestionReject,
    onSuggestionRangeEdit,
    onSuggestionClick,
  },
  ref,
) {
  const markersLaneRef = useRef<HTMLDivElement | null>(null);
  const onRangeEditRef = useRef(onRangeEdit);
  useEffect(() => { onRangeEditRef.current = onRangeEdit; }, [onRangeEdit]);
  const onSuggestionRangeEditRef = useRef(onSuggestionRangeEdit);
  useEffect(() => { onSuggestionRangeEditRef.current = onSuggestionRangeEdit; }, [onSuggestionRangeEdit]);
  // Zewnętrzny scroll (wspólny dla fali i blocków).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Wewnętrzny kontener o szerokości = duration * pxPerSec — wavesurfer i bar dzielą tę oś.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
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
  // Baseline px/sec = szerokość kontenera / duration. Zoom 1× startuje od tej wartości.
  const [basePxPerSec, setBasePxPerSec] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(0);

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

        const container = waveRef.current;
        if (!container) return;

        const audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audioRef.current = audio;

        if (deliveryType === 'hls') {
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(audio);
            hlsRef.current = hls;
          } else {
            audio.src = url;
          }
        } else {
          audio.src = url;
        }

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
          fillParent: true,
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
          // Bazowy px/sec = aktualna szerokość scroll containera / duration.
          const w = scrollRef.current?.clientWidth ?? 0;
          if (w > 0 && d > 0) {
            setBasePxPerSec(w / d);
          }
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

  // ── Zoom: aplikuj minPxPerSec i przelicz szerokość inner wrappera ──────────
  const zoomMultiplier = ZOOM_STEPS[zoomIdx];
  const effectivePxPerSec = basePxPerSec > 0 ? basePxPerSec * zoomMultiplier : 0;
  const innerWidthPx = duration > 0 && effectivePxPerSec > 0 ? duration * effectivePxPerSec : null;

  useEffect(() => {
    if (!innerWidthPx) return;
    // Ustaw explicit width na inner wrapperze; wavesurfer z fillParent:true
    // automatycznie przerenderuje falę do tej szerokości (ResizeObserver).
    // Blocki mówców poniżej korzystają z tego samego wrappera — oś X spójna.
    if (innerRef.current) innerRef.current.style.width = `${innerWidthPx}px`;
  }, [innerWidthPx]);

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

  const zoomIn = useCallback(() => {
    setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomIdx((i) => Math.max(0, i - 1));
  }, []);
  const zoomReset = useCallback(() => setZoomIdx(0), []);

  // Bar: oblicz fallback duration dla pozycjonowania blocków (gdy wavesurfer
  // jeszcze nie raportował duration — np. transkrypcja była w cache).
  const barBaseDuration = useMemo(() => {
    if (duration > 0) return duration;
    if (speakerSegments && speakerSegments.length > 0) {
      return speakerSegments[speakerSegments.length - 1].endSec;
    }
    return 0;
  }, [duration, speakerSegments]);

  // Szerokość inner gdy jeszcze nie znamy basePxPerSec (przed ready) — 100% scroll.
  const innerStyleWidth = innerWidthPx ? `${innerWidthPx}px` : '100%';

  // ── Drag handle'y dla selected fragmentu ─────────────────────────────────
  // Użytkownik łapie kreskę start/end i przesuwa — wyliczamy nowy czas wg
  // pozycji kursora względem szerokości lane i emitujemy onRangeEdit.
  const startHandleDrag = useCallback(
    (fragmentId: string, edge: 'start' | 'end', origStart: number, origEnd: number) =>
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const lane = markersLaneRef.current;
      if (!lane) return;
      const dur = barBaseDuration;
      if (dur <= 0) return;

      let curStart = origStart;
      let curEnd = origEnd;

      const onMove = (ev: MouseEvent) => {
        const rect = lane.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const sec = (x / rect.width) * dur;
        if (edge === 'start') {
          curStart = Math.max(0, Math.min(sec, curEnd - 0.1));
        } else {
          curEnd = Math.max(curStart + 0.1, Math.min(sec, dur));
        }
        onRangeEditRef.current?.(fragmentId, curStart, curEnd);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [barBaseDuration],
  );

  // ── Drag handle'y dla sugestii AI ────────────────────────────────────────
  const startSuggestionDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string, edge: 'start' | 'end', origStart: number, origEnd: number) => {
      e.preventDefault();
      e.stopPropagation();
      const lane = markersLaneRef.current;
      if (!lane) return;
      const dur = barBaseDuration;
      if (dur <= 0) return;

      let curStart = origStart;
      let curEnd = origEnd;

      const onMove = (ev: MouseEvent) => {
        const rect = lane.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const sec = (x / rect.width) * dur;
        if (edge === 'start') {
          curStart = Math.max(0, Math.min(sec, curEnd - 0.1));
        } else {
          curEnd = Math.max(curStart + 0.1, Math.min(sec, dur));
        }
        onSuggestionRangeEditRef.current?.(id, curStart, curEnd);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [barBaseDuration],
  );

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

        <div className="text-xs font-mono text-htg-fg-muted tabular-nums shrink-0 w-24">
          {fmt(currentTime)} / {fmt(duration)}
        </div>

        {/* Zoom controls — zawsze widoczne, poza scroll area */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={zoomOut}
            disabled={zoomIdx === 0 || status !== 'ready'}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
            title="Pomniejsz"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-htg-fg-muted tabular-nums w-8 text-center">
            {zoomMultiplier}×
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIdx === ZOOM_STEPS.length - 1 || status !== 'ready'}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
            title="Powiększ"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomReset}
            disabled={zoomIdx === 0 || status !== 'ready'}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
            title="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Wspólny scroll wrapper dla fali i blocków mówców — jedna oś X */}
      <div ref={scrollRef} className="w-full overflow-x-auto overflow-y-hidden">
        <div ref={innerRef} style={{ width: innerStyleWidth }}>

          {/* Markery nad falą — zapisane Momenty + sugestie AI + edytowalny zakres */}
          {barBaseDuration > 0 && (
            <div
              ref={markersLaneRef}
              className="relative h-6 w-full mb-1 rounded bg-htg-card-border/20"
            >
              {/* Zapisane Momenty */}
              {fragments?.map((f) => {
                const leftPct = (f.start_sec / barBaseDuration) * 100;
                const widthPct = Math.max(0.1, ((f.end_sec - f.start_sec) / barBaseDuration) * 100);
                const isSelected = selectedFragmentId === f.id;
                const color = markerColorFor(f.tag);
                return (
                  <div
                    key={`frag-${f.id}`}
                    title={`${Math.round(f.end_sec - f.start_sec)}s`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFragmentClick?.(f.id);
                    }}
                    className={[
                      'absolute top-0 h-full cursor-pointer transition-opacity rounded-sm',
                      color,
                      isSelected
                        ? 'opacity-100 ring-1 ring-white/80'
                        : 'opacity-50 hover:opacity-80',
                    ].join(' ')}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                );
              })}

              {/* Sugestie AI — interaktywne markery */}
              {suggestions?.map((s) => {
                const leftPct = (s.startSec / barBaseDuration) * 100;
                const widthPct = Math.max(0.1, ((s.endSec - s.startSec) / barBaseDuration) * 100);
                return (
                  <div
                    key={`sug-${s.id}`}
                    className="absolute top-0 h-full group"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    {/* tło — dashed outline, klik = seek+play */}
                    <div
                      className="absolute inset-0 border-2 border-dashed border-htg-lavender/70 bg-htg-lavender/10 cursor-pointer rounded-sm"
                      onClick={(e) => { e.stopPropagation(); onSuggestionClick?.(s.startSec); }}
                      title={s.title ?? 'Propozycja'}
                    />

                    {/* lewy uchwyt drag */}
                    <div
                      className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-htg-lavender/60 hover:bg-htg-lavender z-10"
                      onMouseDown={(e) => startSuggestionDrag(e, s.id, 'start', s.startSec, s.endSec)}
                    />

                    {/* prawy uchwyt drag */}
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-htg-lavender/60 hover:bg-htg-lavender z-10"
                      onMouseDown={(e) => startSuggestionDrag(e, s.id, 'end', s.startSec, s.endSec)}
                    />

                    {/* accept/reject buttons — widoczne przy hover */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center gap-1 z-20 pointer-events-none">
                      <button
                        type="button"
                        className="pointer-events-auto w-5 h-5 rounded-full bg-htg-sage text-white text-[10px] flex items-center justify-center shadow hover:bg-htg-sage/80"
                        onClick={(e) => { e.stopPropagation(); onSuggestionAccept?.(s.id); }}
                        title="Akceptuj"
                      >✓</button>
                      <button
                        type="button"
                        className="pointer-events-auto w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow hover:bg-red-400"
                        onClick={(e) => { e.stopPropagation(); onSuggestionReject?.(s.id); }}
                        title="Odrzuć"
                      >✗</button>
                    </div>
                  </div>
                );
              })}

              {/* Draggable handles dla selected fragmentu */}
              {(() => {
                const sel = fragments?.find((f) => f.id === selectedFragmentId);
                if (!sel) return null;
                const startPct = (sel.start_sec / barBaseDuration) * 100;
                const endPct = (sel.end_sec / barBaseDuration) * 100;
                return (
                  <>
                    <div
                      onMouseDown={startHandleDrag(sel.id, 'start', sel.start_sec, sel.end_sec)}
                      title="Przesuń początek"
                      className="absolute top-[-2px] h-[calc(100%+4px)] w-1 bg-white cursor-ew-resize hover:w-1.5 transition-all"
                      style={{ left: `calc(${startPct}% - 2px)` }}
                    />
                    <div
                      onMouseDown={startHandleDrag(sel.id, 'end', sel.start_sec, sel.end_sec)}
                      title="Przesuń koniec"
                      className="absolute top-[-2px] h-[calc(100%+4px)] w-1 bg-white cursor-ew-resize hover:w-1.5 transition-all"
                      style={{ left: `calc(${endPct}% - 2px)` }}
                    />
                  </>
                );
              })()}
            </div>
          )}

          <div ref={waveRef} className="w-full" />

          {/* Pasek mówców pod falą — te same proporcje, ten sam scroll */}
          {speakerSegments && speakerSegments.length > 0 && barBaseDuration > 0 && (
            <div className="relative h-4 w-full mt-1 rounded bg-htg-card-border/40 overflow-hidden">
              {speakerSegments.map((s) => {
                const leftPct = (s.startSec / barBaseDuration) * 100;
                const widthPct = Math.max(0.1, ((s.endSec - s.startSec) / barBaseDuration) * 100);
                const c = speakerColor(s.role, s.speakerKey);
                return (
                  <div
                    key={s.id}
                    title={`${s.displayName ?? s.speakerKey} · ${Math.round(s.endSec - s.startSec)}s`}
                    className={`absolute top-0 h-full ${c.bar}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                );
              })}
              {/* Playhead zsynchronizowany z wavesurfer cursor */}
              {duration > 0 && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-white/90 pointer-events-none"
                  style={{ left: `${(currentTime / barBaseDuration) * 100}%` }}
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      <p className="text-[11px] text-htg-fg-muted">
        Spacja — play/pause · klik na falę — seek · S — start tu · E — koniec tu · +/− — zoom fali · Shift+drag — zaznacz zakres · drag markery — zmień zakres
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
