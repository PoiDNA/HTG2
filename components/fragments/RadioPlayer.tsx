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
  /** Set by radio/next when scope='pytania' — signals pytania-answer-token path */
  pytaniaSessionFragmentId?: string;
  /** Set by radio/next when scope='slowo' — signals impulse/fragment-token path with sessionFragmentId */
  slowoSessionFragmentId?: string;
}

type RadioScope = 'all' | 'favorites' | 'category' | 'session' | 'pytania' | 'slowo';
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
    // Pytania: use pytania-answer-token with sessionFragmentId
    ...(save.pytaniaSessionFragmentId ? { sessionFragmentId: save.pytaniaSessionFragmentId } : {}),
    // Słowo: use fragment-token (PATH B) with sessionFragmentId — explicit endpoint to override default
    ...(save.slowoSessionFragmentId ? {
      sessionFragmentId: save.slowoSessionFragmentId,
      tokenEndpoint: '/api/video/fragment-token',
    } : {}),
  };
}

const NON_REPEAT_WINDOW = 5;

// ---------------------------------------------------------------------------
// Bumper volume envelope
// ---------------------------------------------------------------------------
//
// The 30-second bumper files (m-pause-*.mp3) are played at maximum signal
// level; JavaScript applies a cosine-interpolated volume envelope so their
// perceived loudness follows a precise shape:
//
//   t  0 → 2 s   cosine ramp  0% → 20%    (soft entry under ambient music)
//   t  2 → 6 s   plateau      20%
//   t  6 → 8 s   cosine ramp  20% → 55%   (rise toward body)
//   t  8 → 22 s  plateau      100%         (bumper body at full volume)
//   t 22 → 24 s  cosine ramp  100% → 20%  (fade-out starts as next fragment plays)
//   t 24 → 28 s  plateau      20%
//   t 28 → 30 s  cosine ramp  20% → 0%    (silence)
//
// The interval-based approach (vs requestAnimationFrame) is background-tab
// safe — RAF is throttled/suspended in hidden tabs by Chrome and Firefox.
//
// Timing constants derived from the 30 s envelope:
//
//   NEAR_END_OFFSET_SEC = 6   → bumper starts 6 s before fragment ends
//                               (t=0 of envelope). Must stay in sync with
//                               NEAR_END_OFFSET_SEC in FragmentRadioEngine.tsx.
//   BUMPER_HOLD_MS = 16 000   → from fragment-end (bumper t=6) to next-fragment
//                               start (bumper t=22): 22 − 6 = 16 s.
//   BUMPER_FADE_OUT_MS = 8 000 → next fragment starts at bumper t=22;
//                                bumper pauses at t=30: 30 − 22 = 8 s.

const BUMPER_HOLD_MS     = 16_000;
const BUMPER_FADE_OUT_MS = 8_000;

/**
 * Returns the target volume [0–1] for the bumper at playback time `t` seconds.
 * Uses cosine interpolation for perceptually smooth transitions.
 */
function getBumperVolume(t: number): number {
  const coslerp = (from: number, to: number, p: number) =>
    from + (to - from) * (1 - Math.cos(p * Math.PI)) / 2;
  if (t <= 0)  return 0;
  if (t < 2)   return coslerp(0, 0.20, t / 2);
  if (t < 6)   return 0.20;
  if (t < 8)   return coslerp(0.20, 0.55, (t - 6) / 2);
  if (t < 22)  return 1.0;   // instant step to 100% at t=8, plateau
  if (t < 24)  return coslerp(1.0, 0.20, (t - 22) / 2);
  if (t < 28)  return 0.20;
  if (t <= 30) return coslerp(0.20, 0, (t - 28) / 2);
  return 0;
}

// ── Bumper file pool ──────────────────────────────────────────────────────────
// 23 pause files served from CDN. We pick at random while avoiding recent
// repeats within a window of BUMPER_NON_REPEAT_WINDOW to keep the radio
// feeling varied (window ≈ 1/3 of pool size).
const BUMPER_BASE_URL          = 'https://htg2-cdn.b-cdn.net/momentum-pause';
const BUMPER_COUNT             = 23;
const BUMPER_NON_REPEAT_WINDOW = 7;

/**
 * Pick a bumper index (1–BUMPER_COUNT) that is NOT in the last
 * BUMPER_NON_REPEAT_WINDOW indices played. Falls back to full pool if the
 * window happens to cover everything (shouldn't happen at current counts).
 */
function pickBumperIndex(recentlyUsed: number[]): number {
  const recent = recentlyUsed.slice(-BUMPER_NON_REPEAT_WINDOW);
  const pool = Array.from({ length: BUMPER_COUNT }, (_, i) => i + 1)
    .filter(i => !recent.includes(i));
  const candidates = pool.length > 0 ? pool : Array.from({ length: BUMPER_COUNT }, (_, i) => i + 1);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  scope: RadioScope;
  scopeId?: string;
  scopeLabel?: string;
  compact?: boolean;
}

export default function RadioPlayer({
  scope,
  scopeId,
  scopeLabel,
  compact = false,
}: Props) {
  // Only used to stop any ambient VOD / recording playback the user might
  // have running in GlobalPlayer. Radio runs on its own engine (below).
  const { stopPlayback: stopGlobalPlayback } = usePlayer();

  const [status, setStatus] = useState<RadioStatus>('idle');
  const [current, setCurrent] = useState<RadioSave | null>(null);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  /**
   * When false, the engine loads token + HLS but does not auto-play.
   * Set false before playSave() during bumper hold so the next fragment
   * buffers silently. Set back to true before calling engine.play().
   */
  const [engineAutoPlay, setEngineAutoPlay] = useState(true);

  const excludeIdsRef = useRef<string[]>([]);
  useEffect(() => { excludeIdsRef.current = excludeIds; }, [excludeIds]);

  const engineRef = useRef<FragmentRadioEngineHandle>(null);
  const bumperRef = useRef<HTMLAudioElement | null>(null);
  const isFetchingRef = useRef(false);
  /** Tracks recently played bumper indices for non-repeat selection. */
  const usedBumperIndicesRef = useRef<number[]>([]);
  /** Increment to cancel any in-progress bumper sequence. */
  const bumperGenRef = useRef(0);
  /**
   * Set in handleNearEnd when we start the bumper fade-in 6 s before the
   * fragment ends. handleEnded reads this to know whether to start a fresh
   * bumper sequence or just continue (hold + playSave + fade-out).
   */
  const nearEndActiveRef = useRef(false);
  /**
   * Pre-fetch started in handleNearEnd, consumed in handleEnded.
   * Stored as a Promise so handleEnded can await it (it may already be
   * resolved by the time handleEnded fires, 6 s later).
   */
  const prefetchRef = useRef<{
    promise: Promise<RadioSave | null>;
    exclude: string[];
  } | null>(null);
  /**
   * setInterval handle for the bumper volume curve. Polling at 50 ms keeps
   * the envelope accurate while staying background-tab safe (RAF is throttled).
   * Cleared by stopBumperCurve() which is called whenever bumper is paused.
   */
  const bumperCurveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when scope/scopeId changes
  const prevScopeKey = useRef(`${scope}:${scopeId}`);

  // ── Bumper curve helpers ──────────────────────────────────────────────────

  const stopBumperCurve = useCallback(() => {
    if (bumperCurveIntervalRef.current !== null) {
      clearInterval(bumperCurveIntervalRef.current);
      bumperCurveIntervalRef.current = null;
    }
  }, []);

  const startBumperCurve = useCallback((bumper: HTMLAudioElement) => {
    stopBumperCurve();
    bumperCurveIntervalRef.current = setInterval(() => {
      if (bumper.paused || bumper.ended) { stopBumperCurve(); return; }
      bumper.volume = getBumperVolume(bumper.currentTime);
    }, 50);
  }, [stopBumperCurve]);

  useEffect(() => {
    const key = `${scope}:${scopeId}`;
    if (key !== prevScopeKey.current) {
      prevScopeKey.current = key;
      nearEndActiveRef.current = false;
      prefetchRef.current = null;
      bumperGenRef.current++;
      setEngineAutoPlay(true);
      stopBumperCurve();
      const b = bumperRef.current;
      if (b && !b.paused) { b.pause(); b.currentTime = 0; }
      setStatus('idle');
      setCurrent(null);
      setExcludeIds([]);
      setError(null);
      setCurrentTime(0);
    }
  }, [scope, scopeId, stopBumperCurve]);

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
  // Phase 1 — handleNearEnd (6 s before fragment end, bumper t=0):
  //   • Bumper audio starts at volume=0 (JS curve will ramp it).
  //   • Volume envelope begins: 0→20% (t 0–2 s), plateau 20% (t 2–6 s).
  //   • Next fragment is pre-fetched in parallel.
  //   • By the time the fragment ends (bumper t=6) the bumper is at 20%
  //     and about to ramp toward its body.
  //
  // Phase 2 — handleEnded (at fragment end, bumper t≈6):
  //   • Bumper continues with its volume curve (20%→55%→100% body).
  //   • Hold for BUMPER_HOLD_MS = 16 s (bumper t=6 → t=22).
  //   • Start next fragment (engine reload). Bumper now fades: 100%→20%→0%.
  //   • Pause bumper element after BUMPER_FADE_OUT_MS = 8 s (bumper t=30).
  //
  // Fallback: very short fragments where handleNearEnd fires immediately or
  //   not at all — handleEnded starts the bumper from t=0 sequentially.

  /**
   * Pick next bumper file, assign it to the element, and return true on
   * success. Centralises the src-swap + usedBumperIndices update in one
   * place so both normal (nearEnd) and fallback (ended) paths are consistent.
   */
  const assignBumperSrc = useCallback((bumper: HTMLAudioElement): void => {
    const idx = pickBumperIndex(usedBumperIndicesRef.current);
    usedBumperIndicesRef.current = [...usedBumperIndicesRef.current, idx]
      .slice(-BUMPER_NON_REPEAT_WINDOW);
    bumper.src = `${BUMPER_BASE_URL}/m-pause-${idx}.mp3`;
    bumper.load(); // resets currentTime and starts buffering the new file
  }, []);

  /** Phase 1: start bumper volume curve + pre-fetch, 6 s before fragment end. */
  const handleNearEnd = useCallback(async () => {
    // Guard: engine fires onNearEnd at most once per save, but React may
    // call this via a stale closure. nearEndActiveRef is the truth.
    if (nearEndActiveRef.current) return;
    nearEndActiveRef.current = true;

    const gen = ++bumperGenRef.current;
    const exclude = excludeIdsRef.current;

    // Start pre-fetch immediately — runs in parallel with the bumper.
    // By the time handleEnded fires the fetch is likely already done.
    prefetchRef.current = { promise: fetchNextSave(exclude), exclude };

    const bumper = bumperRef.current;
    if (!bumper) return;

    // Pick a fresh bumper file and start playing at volume=0.
    // The JS volume curve (startBumperCurve) ramps it according to the
    // getBumperVolume envelope — no baked-in fade assumption needed.
    assignBumperSrc(bumper);
    bumper.volume = 0;
    try {
      await bumper.play();
    } catch {
      // Bumper blocked by browser — skipped gracefully, handleEnded fallback.
      return;
    }
    if (bumperGenRef.current !== gen) return; // cancelled during play() await
    startBumperCurve(bumper);
  }, [assignBumperSrc, fetchNextSave, startBumperCurve]);

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
      // ── Normal path: bumper was started 6 s ago at vol=0, curve running ──
      gen = bumperGenRef.current;
      bumperPlaying = !!(bumper && !bumper.paused);
      ({ promise: fetchPromise, exclude } = prefetchRef.current);
      prefetchRef.current = null;
    } else {
      // ── Fallback path: very short fragment / nearEnd missed ────────────
      // Start bumper immediately at vol=0 and kick off the volume curve.
      exclude = excludeIdsRef.current;
      gen = ++bumperGenRef.current;
      prefetchRef.current = null;
      fetchPromise = fetchNextSave(exclude);
      bumperPlaying = false;
      if (bumper) {
        assignBumperSrc(bumper);
        bumper.volume = 0;
        try {
          await bumper.play();
          bumperPlaying = true;
          startBumperCurve(bumper);
        } catch { /* graceful */ }
      }
      // Await the fetch (bumper plays + volume curve runs while we wait).
      await fetchPromise;
      if (bumperGenRef.current !== gen) {
        stopBumperCurve();
        if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
        return;
      }
    }

    const cancelled = () => bumperGenRef.current !== gen;

    // Await next-save fetch (likely already resolved from the 6 s pre-fetch).
    const nextSave = await fetchPromise;
    if (cancelled()) {
      stopBumperCurve();
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
      return;
    }

    if (!nextSave) {
      setStatus('error');
      setError('Brak Momentów do odtworzenia.');
      stopBumperCurve();
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
      return;
    }

    // ── Preload next fragment silently during hold ─────────────────────────
    // Set autoPlay=false BEFORE playSave so the engine loads token + HLS but
    // does not start playback automatically. The fragment will be fully buffered
    // by the time the hold phase ends (~16 s >> ~1–2 s for token + HLS manifest).
    setEngineAutoPlay(false);
    playSave(nextSave, exclude);

    // Hold — bumper body plays (100% volume, t=8–22) while next fragment buffers.
    if (bumperPlaying) {
      await new Promise<void>(r => setTimeout(r, BUMPER_HOLD_MS));
      if (cancelled()) {
        stopBumperCurve();
        bumper!.pause(); bumper!.currentTime = 0;
        setEngineAutoPlay(true);
        return;
      }
    }

    // Fragment is ready (buffered during hold). Enable autoPlay and start.
    setEngineAutoPlay(true);
    engineRef.current?.play();

    // Let bumper's envelope fade-out finish (t=22–30), then pause the element.
    if (bumperPlaying && bumper) {
      const b = bumper;
      setTimeout(() => {
        if (!cancelled()) {
          stopBumperCurve();
          b.pause(); b.currentTime = 0;
        }
      }, BUMPER_FADE_OUT_MS);
    }
  }, [assignBumperSrc, fetchNextSave, playSave, startBumperCurve, stopBumperCurve]);

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
    setEngineAutoPlay(true);
    bumperGenRef.current++;
    stopBumperCurve();
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    fetchNext(excludeIdsRef.current);
  }, [fetchNext, stopBumperCurve]);

  const handleStop = useCallback(() => {
    nearEndActiveRef.current = false;
    prefetchRef.current = null;
    setEngineAutoPlay(true);
    bumperGenRef.current++;
    stopBumperCurve();
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    engineRef.current?.stop();
    setStatus('idle');
    setCurrent(null);
    setExcludeIds([]);
    setError(null);
    setCurrentTime(0);
  }, [stopBumperCurve]);

  // Stop on unmount (navigation away from radio page)
  useEffect(() => {
    return () => {
      if (bumperCurveIntervalRef.current !== null) {
        clearInterval(bumperCurveIntervalRef.current);
      }
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
      {/* Hidden bumper audio — src is assigned dynamically before each play
          from the m-pause-{1-23} pool so we never preload a fixed file. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bumperRef} preload="none" style={{ display: 'none' }} />

      {/* Dedicated fragment engine — no Web Audio, no heartbeat */}
      <FragmentRadioEngine
        ref={engineRef}
        save={current && isActive ? toEngineSave(current) : null}
        autoPlay={engineAutoPlay}
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
