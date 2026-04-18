'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Play, Pause, SkipForward, X, Loader2, Music } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import {
  FragmentRadioEngine,
  type FragmentRadioEngineHandle,
  type FragmentRadioSave as EngineFragmentSave,
} from './FragmentRadioEngine';

// ─────────────────────────────────────────────────────────────────────────────
// RadioPlayer
//
// Orchestrates Radio Momentów: fetches next save from /api/fragments/radio/next,
// plays the fragment via the dedicated FragmentRadioEngine (NOT AudioEngine —
// see FragmentRadioEngine.tsx for rationale), crossfades into a bumper between
// fragments.
//
// Radio is intentionally page-local: navigating away stops playback. This
// eliminates the cross-page persistence complexity that produced the 30s
// heartbeat bug. For "continue listening on other pages", use the standard
// mini-player for single fragments (fragment_review context), not radio.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadioSave {
  id: string;
  session_template_id: string;
  fragment_type: 'predefined' | 'custom';
  fallback_start_sec: number | null;
  fallback_end_sec: number | null;
  custom_start_sec: number | null;
  custom_end_sec: number | null;
  custom_title: string | null;
  session_templates: { id: string; title: string; slug: string };
}

type RadioScope = 'all' | 'favorites' | 'category' | 'session';
type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSaveRange(save: RadioSave): { startSec: number; endSec: number } {
  if (save.fragment_type === 'predefined') {
    return { startSec: save.fallback_start_sec ?? 0, endSec: save.fallback_end_sec ?? 0 };
  }
  return { startSec: save.custom_start_sec ?? 0, endSec: save.custom_end_sec ?? 0 };
}

function getSaveTitle(save: RadioSave): string {
  if (save.custom_title) return save.custom_title;
  const { startSec, endSec } = getSaveRange(save);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${fmt(startSec)} – ${fmt(endSec)}`;
}

function toEngineSave(save: RadioSave): EngineFragmentSave {
  const { startSec, endSec } = getSaveRange(save);
  return {
    saveId: save.id,
    startSec,
    endSec,
    sessionTitle: save.session_templates.title,
    fragmentTitle: getSaveTitle(save),
  };
}

/**
 * Linear volume ramp using setInterval (background-tab safe).
 * requestAnimationFrame is suspended when the tab is hidden, which would stall
 * the bumper sequence indefinitely. setInterval is throttled to ~1 s in the
 * background but still fires; we also fast-path when the document is hidden:
 * jump straight to the target volume and resolve immediately.
 */
function rampVolume(
  el: HTMLAudioElement,
  from: number,
  to: number,
  durationMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise(resolve => {
    el.volume = Math.max(0, Math.min(1, from));

    if (typeof document !== 'undefined' && document.hidden) {
      el.volume = Math.max(0, Math.min(1, to));
      resolve();
      return;
    }

    const start = performance.now();
    const interval = setInterval(() => {
      if (isCancelled()) {
        clearInterval(interval);
        resolve();
        return;
      }
      const t = Math.min((performance.now() - start) / durationMs, 1);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        clearInterval(interval);
        resolve();
      }
    }, 16);
  });
}

const NON_REPEAT_WINDOW = 5;

// Bumper timing constants (total = FADE_IN + HOLD + FADE_OUT = 15s)
const BUMPER_FADE_IN_MS  = 3_000;
const BUMPER_HOLD_MS     = 9_000;
const BUMPER_FADE_OUT_MS = 3_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  scope: RadioScope;
  scopeId?: string;
  scopeLabel?: string;
  compact?: boolean;
  bumperUrl?: string;
}

export default function RadioPlayer({
  scope,
  scopeId,
  scopeLabel,
  compact = false,
  bumperUrl = 'https://htg2-cdn.b-cdn.net/audio/radio-bumper.mp3',
}: Props) {
  // Only used to stop any ambient VOD / recording playback the user might
  // have running in GlobalPlayer. Radio runs on its own engine (below).
  const { stopPlayback: stopGlobalPlayback } = usePlayer();

  const [status, setStatus] = useState<RadioStatus>('idle');
  const [current, setCurrent] = useState<RadioSave | null>(null);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const excludeIdsRef = useRef<string[]>([]);
  useEffect(() => { excludeIdsRef.current = excludeIds; }, [excludeIds]);

  const engineRef = useRef<FragmentRadioEngineHandle>(null);
  const bumperRef = useRef<HTMLAudioElement | null>(null);
  const isFetchingRef = useRef(false);
  /** Increment to cancel any in-progress bumper sequence. */
  const bumperGenRef = useRef(0);
  /**
   * Set in handleNearEnd when we start the bumper fade-in 3 s before the
   * fragment ends. handleEnded reads this to know whether to start a fresh
   * bumper sequence or just continue (hold + playSave + fade-out).
   */
  const nearEndActiveRef = useRef(false);
  /**
   * Pre-fetch started in handleNearEnd, consumed in handleEnded.
   * Stored as a Promise so handleEnded can await it (it may already be
   * resolved by the time handleEnded fires, 3 s later).
   */
  const prefetchRef = useRef<{
    promise: Promise<RadioSave | null>;
    exclude: string[];
  } | null>(null);

  // Reset when scope/scopeId changes
  const prevScopeKey = useRef(`${scope}:${scopeId}`);
  useEffect(() => {
    const key = `${scope}:${scopeId}`;
    if (key !== prevScopeKey.current) {
      prevScopeKey.current = key;
      nearEndActiveRef.current = false;
      prefetchRef.current = null;
      bumperGenRef.current++;
      const b = bumperRef.current;
      if (b && !b.paused) { b.pause(); b.currentTime = 0; }
      setStatus('idle');
      setCurrent(null);
      setExcludeIds([]);
      setError(null);
      setCurrentTime(0);
    }
  }, [scope, scopeId]);

  const isActive = status !== 'idle';
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  // ── Fetch next save metadata ──────────────────────────────────────────────

  const fetchNextSave = useCallback(async (
    exclude: string[],
    retry = false,
  ): Promise<RadioSave | null> => {
    try {
      const res = await fetch('/api/fragments/radio/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, scopeId, excludeIds: exclude }),
      });
      const data = await res.json();
      if (!res.ok) return null;
      if (!data.save) {
        if (!retry) return fetchNextSave([], true);
        return null;
      }
      return data.save as RadioSave;
    } catch {
      return null;
    }
  }, [scope, scopeId]);

  // ── Start playback of a fetched save ──────────────────────────────────────

  const playSave = useCallback((save: RadioSave, fromExcludes: string[]) => {
    // Reset per-fragment bumper state so the NEXT fragment starts fresh.
    nearEndActiveRef.current = false;
    prefetchRef.current = null;
    const newExcludes = [...fromExcludes, save.id].slice(-NON_REPEAT_WINDOW);
    setCurrent(save);
    setExcludeIds(newExcludes);
    setStatus('loading');
    setError(null);
    setCurrentTime(0);
    // FragmentRadioEngine reacts to `save` prop change: token fetch + play
    // happens inside the engine; no imperative call needed here.
  }, []);

  // ── Initial / skip: fetch + play immediately ──────────────────────────────

  const fetchNext = useCallback(async (exclude: string[]) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    // Kill any ambient GlobalPlayer audio (VOD session review, recording)
    // before starting radio — avoids dual playback.
    stopGlobalPlayback();
    setStatus('loading');
    setError(null);
    try {
      const save = await fetchNextSave(exclude);
      if (!save) {
        setStatus('error');
        setError('Brak Momentów do odtworzenia.');
        return;
      }
      playSave(save, exclude);
    } catch {
      setStatus('error');
      setError('Błąd połączenia.');
    } finally {
      isFetchingRef.current = false;
    }
  }, [fetchNextSave, playSave, stopGlobalPlayback]);

  // ── Bumper crossfade sequence ─────────────────────────────────────────────
  //
  // Two-phase design for seamless crossfades:
  //
  // Phase 1 — handleNearEnd (3 s before fragment end):
  //   • Bumper audio starts at volume=0, fades to 1 over 3 s.
  //   • Next fragment is pre-fetched in parallel.
  //   • By the time the fragment ends the bumper is at full volume.
  //
  // Phase 2 — handleEnded (at fragment end):
  //   • Bumper is already playing at full volume (phase 1 complete).
  //   • Hold for BUMPER_HOLD_MS (bumper content plays).
  //   • Start next fragment (engine reload).
  //   • Fade bumper out over 3 s while the next fragment plays.
  //
  // Fallback: very short fragments where handleNearEnd fires immediately or
  //   not at all — handleEnded falls back to the old sequential behaviour
  //   (start bumper, fade in, hold, playSave, fade out).

  /** Phase 1: start bumper fade-in + pre-fetch, 3 s before fragment end. */
  const handleNearEnd = useCallback(async () => {
    // Guard: engine fires onNearEnd at most once per save, but React may
    // call this via a stale closure. nearEndActiveRef is the truth.
    if (nearEndActiveRef.current) return;
    nearEndActiveRef.current = true;

    const gen = ++bumperGenRef.current;
    const cancelled = () => bumperGenRef.current !== gen;
    const exclude = excludeIdsRef.current;

    // Start pre-fetch immediately — runs in parallel with the 3 s fade-in.
    // By the time handleEnded fires (3 s later) the fetch is likely done.
    prefetchRef.current = { promise: fetchNextSave(exclude), exclude };

    const bumper = bumperRef.current;
    if (!bumper) return;
    bumper.currentTime = 0;
    bumper.volume = 0;
    try {
      await bumper.play();
    } catch {
      // Bumper blocked by browser — crossfade skipped, handleEnded fallback.
      return;
    }
    if (!cancelled()) {
      // Non-blocking ramp: reaches vol=1 in exactly 3 s — same duration as
      // the remaining fragment playback. Bumper is at full volume when ended fires.
      rampVolume(bumper, 0, 1, BUMPER_FADE_IN_MS, cancelled);
    }
  }, [fetchNextSave]);

  /** Phase 2: hold bumper + start next fragment + fade bumper out. */
  const handleEnded = useCallback(async () => {
    const hadNearEnd = nearEndActiveRef.current;
    nearEndActiveRef.current = false;

    const bumper = bumperRef.current;
    let gen: number;
    let bumperPlaying: boolean;
    let fetchPromise: Promise<RadioSave | null>;
    let exclude: string[];

    if (hadNearEnd && prefetchRef.current) {
      // ── Normal path: bumper was started 3 s ago ────────────────────────
      // Reuse the same cancellation gen set in handleNearEnd so that any
      // in-progress rampVolume or skip/stop cancels this phase too.
      gen = bumperGenRef.current;
      bumperPlaying = !!(bumper && !bumper.paused);
      ({ promise: fetchPromise, exclude } = prefetchRef.current);
      prefetchRef.current = null;
    } else {
      // ── Fallback path: very short fragment / nearEnd missed ────────────
      // Start bumper and fetch sequentially (old behaviour).
      exclude = excludeIdsRef.current;
      gen = ++bumperGenRef.current;
      prefetchRef.current = null;
      const fetchP = fetchNextSave(exclude);
      fetchPromise = fetchP;
      bumperPlaying = false;
      if (bumper) {
        bumper.currentTime = 0;
        bumper.volume = 0;
        try { await bumper.play(); bumperPlaying = true; } catch { /* graceful */ }
      }
      // Fade in + await fetch in parallel (same as old playBumperThenNext).
      await Promise.all([
        fetchP,
        bumperPlaying
          ? rampVolume(bumper!, 0, 1, BUMPER_FADE_IN_MS, () => bumperGenRef.current !== gen)
          : Promise.resolve(),
      ]);
      if (bumperGenRef.current !== gen) {
        if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
        return;
      }
    }

    const cancelled = () => bumperGenRef.current !== gen;

    // Hold — bumper plays at full volume (or silence if bumper was blocked).
    if (bumperPlaying) {
      await new Promise<void>(r => setTimeout(r, BUMPER_HOLD_MS));
      if (cancelled()) {
        bumper!.pause(); bumper!.currentTime = 0;
        return;
      }
    }

    // Await next-save fetch (likely already resolved from the 3 s pre-fetch).
    const nextSave = await fetchPromise;
    if (cancelled()) {
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
      return;
    }

    if (nextSave) {
      // Start the next fragment — engine reloads while bumper is still audible.
      playSave(nextSave, exclude);
      // Fade bumper out over 3 s, overlapping the start of the next fragment.
      if (bumperPlaying && bumper) {
        rampVolume(bumper, 1, 0, BUMPER_FADE_OUT_MS, cancelled).then(() => {
          if (!cancelled()) { bumper.pause(); bumper.currentTime = 0; }
        });
      }
    } else {
      setStatus('error');
      setError('Brak Momentów do odtworzenia.');
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
    }
  }, [fetchNextSave, playSave]);

  // ── Engine callbacks ──────────────────────────────────────────────────────

  const handlePlaying = useCallback(() => setStatus('playing'), []);
  const handlePause = useCallback(() => {
    // Only react to pauses while actively playing. Other states must be
    // preserved because the engine fires synthetic pause events in scenarios
    // where the user is NOT pausing real playback:
    //   • 'loading'   — swapping between fragments (teardown → reload).
    //   • 'idle'      — handleStop just cleared state; teardown pause would
    //                   otherwise flip isActive=true with current=null,
    //                   making the play button route to handlePlayPause
    //                   (empty element) instead of handleStart.
    //   • 'error'     — keep the error visible; don't silently change status.
    //   • 'paused'    — idempotent (no-op) but avoids needless render.
    setStatus(prev => (prev === 'playing' ? 'paused' : prev));
  }, []);
  const handleError = useCallback((msg: string) => {
    setStatus('error');
    setError(msg);
  }, []);
  const handleTimeUpdate = useCallback((t: number) => { setCurrentTime(t); }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    // Prime the audio element SYNCHRONOUSLY inside the click handler.
    // Safari requires audio.play() to originate from the user gesture call
    // stack, not an async continuation after a network fetch. Calling play()
    // on the still-empty <audio> element reserves the autoplay grant; when
    // the real source attaches later, the element is already "user-activated"
    // and the deferred play() in FragmentRadioEngine succeeds.
    engineRef.current?.primePlayback();
    fetchNext(excludeIds);
  }, [fetchNext, excludeIds]);

  const handlePlayPause = useCallback(() => {
    if (!engineRef.current) return;
    if (isPlaying) engineRef.current.pause();
    else engineRef.current.play();
  }, [isPlaying]);

  const handleSkip = useCallback(() => {
    nearEndActiveRef.current = false;
    prefetchRef.current = null;
    bumperGenRef.current++;
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    fetchNext(excludeIdsRef.current);
  }, [fetchNext]);

  const handleStop = useCallback(() => {
    nearEndActiveRef.current = false;
    prefetchRef.current = null;
    bumperGenRef.current++;
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    engineRef.current?.stop();
    setStatus('idle');
    setCurrent(null);
    setExcludeIds([]);
    setError(null);
    setCurrentTime(0);
  }, []);

  // Stop on unmount (navigation away from radio page)
  useEffect(() => {
    return () => {
      bumperGenRef.current++;
      engineRef.current?.stop();
    };
  }, []);

  // ── Progress bar data ─────────────────────────────────────────────────────

  const range = current ? getSaveRange(current) : null;
  const rangeStart = range?.startSec ?? 0;
  const rangeEnd = range?.endSec ?? 0;
  const fragDur = rangeEnd - rangeStart;
  const elapsed = current
    ? Math.max(0, Math.min(currentTime - rangeStart, fragDur))
    : 0;
  const progress = fragDur > 0 ? (elapsed / fragDur) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden bumper audio — preloaded so playback starts instantly */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bumperRef} src={bumperUrl} preload="auto" style={{ display: 'none' }} />

      {/* Dedicated fragment engine — no Web Audio, no heartbeat */}
      <FragmentRadioEngine
        ref={engineRef}
        save={current && isActive ? toEngineSave(current) : null}
        onPlaying={handlePlaying}
        onPause={handlePause}
        onNearEnd={handleNearEnd}
        onEnded={handleEnded}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
      />

      {compact ? (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden">
          <div className="h-0.5 bg-htg-surface">
            <div className="h-full bg-htg-sage transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-htg-sage/10 shrink-0">
              <Radio className="w-4 h-4 text-htg-sage" />
            </div>

            <div className="flex-1 min-w-0">
              {current ? (
                <>
                  <p className="text-xs font-medium text-htg-fg truncate">{getSaveTitle(current)}</p>
                  <p className="text-[11px] text-htg-fg-muted truncate">{current.session_templates.title}</p>
                </>
              ) : (
                <p className="text-xs text-htg-fg-muted">
                  {status === 'error' ? error : 'Radio Momentów'}
                </p>
              )}
            </div>

            {current && (
              <span className="text-[11px] text-htg-fg-muted/60 font-mono shrink-0">
                {fmt(elapsed)}/{fmt(fragDur)}
              </span>
            )}

            {isActive && (
              <button
                onClick={handleStop}
                title="Zatrzymaj"
                className="w-7 h-7 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={!isActive || status === 'error' ? handleStart : handlePlayPause}
              disabled={isLoading}
              aria-label={isPlaying ? 'Pauza' : 'Odtwórz radio'}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-htg-sage text-white hover:bg-htg-sage/90 disabled:opacity-50 shadow-sm shadow-htg-sage/20 transition-all shrink-0"
            >
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isPlaying
                  ? <Pause className="w-4 h-4" />
                  : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            {isActive && (
              <button
                onClick={handleSkip}
                disabled={isLoading}
                title="Pomiń"
                className="w-7 h-7 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface disabled:opacity-30 transition-colors shrink-0"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-htg-sage/10 rounded-2xl flex items-center justify-center">
              <Radio className="w-6 h-6 text-htg-sage" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-htg-fg">Radio Momentów</h2>
              <p className="text-sm text-htg-fg-muted">
                {scopeLabel ?? (scope === 'all' ? 'Wszystkie Momenty' : scope === 'favorites' ? '⭐ Ulubione' : 'Wybrane')}
              </p>
            </div>
          </div>

          <div className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden">
            <div className="h-1 bg-htg-surface">
              <div className="h-full bg-htg-sage transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>

            <div className="p-6">
              {current ? (
                <div className="mb-6 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-htg-fg-muted mb-2">
                    <Music className="w-3 h-3" />
                    <span>{current.session_templates.title}</span>
                  </div>
                  <p className="text-htg-fg font-medium text-base">{getSaveTitle(current)}</p>
                  <p className="text-xs text-htg-fg-muted mt-1 font-mono">{fmt(elapsed)} / {fmt(fragDur)}</p>
                </div>
              ) : (
                <div className="mb-6 text-center">
                  <div className="w-16 h-16 bg-htg-surface rounded-full flex items-center justify-center mx-auto mb-3">
                    <Radio className="w-7 h-7 text-htg-fg-muted" />
                  </div>
                  <p className="text-htg-fg-muted text-sm">
                    {status === 'error' ? error : 'Naciśnij ▶ aby rozpocząć radio'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                {isActive && (
                  <button
                    onClick={handleStop}
                    title="Zatrzymaj radio"
                    className="w-10 h-10 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={!isActive || status === 'error' ? handleStart : handlePlayPause}
                  disabled={isLoading}
                  aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
                  className="w-16 h-16 flex items-center justify-center rounded-full bg-htg-sage text-white hover:bg-htg-sage/90 disabled:opacity-50 shadow-lg shadow-htg-sage/20 transition-all"
                >
                  {isLoading
                    ? <Loader2 className="w-6 h-6 animate-spin" />
                    : isPlaying
                      ? <Pause className="w-6 h-6" />
                      : <Play className="w-6 h-6 ml-1" />}
                </button>

                {isActive && (
                  <button
                    onClick={handleSkip}
                    disabled={isLoading}
                    title="Pomiń"
                    className="w-10 h-10 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface disabled:opacity-30 transition-colors"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {excludeIds.length > 0 && (
            <p className="text-center text-xs text-htg-fg-muted/50 mt-4">
              Ostatnie {excludeIds.length} {excludeIds.length === 1 ? 'Moment' : 'Momenty'} nie powtórzy się
            </p>
          )}
        </div>
      )}
    </>
  );
}
