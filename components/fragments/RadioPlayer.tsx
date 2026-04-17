'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Play, Pause, SkipForward, X, Loader2, Music } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import type { FragmentPlayback } from '@/lib/player-context';

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

interface RadioState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  current: RadioSave | null;
  excludeIds: string[];
  error: string | null;
}

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

/**
 * Linear volume ramp using setInterval (background-tab safe).
 * requestAnimationFrame is suspended when the tab is hidden, which would stall
 * the bumper sequence indefinitely.  setInterval is throttled to ~1 s in the
 * background but still fires, so we also fast-path when the document is hidden:
 * jump straight to the target volume and resolve immediately.
 * Resolves when done or when isCancelled() returns true.
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

    // Background tab fast-path — skip the ramp, jump straight to target
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
    }, 16); // ~60 fps when foregrounded; throttled to ~1 s in background
  });
}

const NON_REPEAT_WINDOW = 5;

// Bumper timing constants (total = FADE_IN + HOLD + FADE_OUT = 15s)
const BUMPER_FADE_IN_MS  = 3_000;
const BUMPER_HOLD_MS     = 9_000;
const BUMPER_FADE_OUT_MS = 3_000;

// ---------------------------------------------------------------------------
// RadioPlayer
// ---------------------------------------------------------------------------

interface Props {
  scope: RadioScope;
  scopeId?: string;
  scopeLabel?: string;
  /** Compact mode — horizontal card for embedding in widgets/sidebars */
  compact?: boolean;
  /** URL of the bumper audio played between moments. Provide /audio/radio-bumper.mp3. */
  bumperUrl?: string;
}

export default function RadioPlayer({
  scope,
  scopeId,
  scopeLabel,
  compact = false,
  bumperUrl = 'https://htg2-cdn.b-cdn.net/audio/radio-bumper.mp3',
}: Props) {
  const { activePlayback, playerState, engineHandle, startPlayback, stopPlayback } = usePlayer();
  const [radio, setRadio] = useState<RadioState>({
    status: 'idle',
    current: null,
    excludeIds: [],
    error: null,
  });
  const [currentTime, setCurrentTime] = useState(0);
  const isFetchingRef = useRef(false);
  const bumperRef     = useRef<HTMLAudioElement | null>(null);
  /** Increment to cancel any in-progress bumper sequence. */
  const bumperGenRef  = useRef(0);

  // Reset when scope/scopeId changes
  const prevScopeKey = useRef(`${scope}:${scopeId}`);
  useEffect(() => {
    const key = `${scope}:${scopeId}`;
    if (key !== prevScopeKey.current) {
      prevScopeKey.current = key;
      bumperGenRef.current++;
      const b = bumperRef.current;
      if (b && !b.paused) { b.pause(); b.currentTime = 0; }
      stopPlayback();
      setRadio({ status: 'idle', current: null, excludeIds: [], error: null });
      setCurrentTime(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  const isRadioActive =
    activePlayback?.kind === 'fragment_radio' ||
    activePlayback?.kind === 'fragment_review';
  const isPlaying = playerState.status === 'playing' && isRadioActive;
  const isLoading = radio.status === 'loading' || (playerState.status === 'loading' && isRadioActive);

  // Subscribe to time for progress bar
  useEffect(() => {
    if (!engineHandle || !isRadioActive) return;
    const unsub = engineHandle.subscribeToTime(setCurrentTime);
    return () => { unsub(); };
  }, [engineHandle, isRadioActive]);

  // ── Fetch just save metadata (no playback) ────────────────────────────────

  const fetchNextSave = useCallback(async (
    excludeIds: string[],
    retry = false,
  ): Promise<RadioSave | null> => {
    try {
      const res = await fetch('/api/fragments/radio/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, scopeId, excludeIds }),
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

  // ── Start playback for a fetched save ────────────────────────────────────

  const playSave = useCallback((save: RadioSave, fromExcludes: string[]) => {
    const newExcludes = [...fromExcludes, save.id].slice(-NON_REPEAT_WINDOW);
    setRadio(prev => ({ ...prev, status: 'playing', current: save, excludeIds: newExcludes }));
    const { startSec, endSec } = getSaveRange(save);
    const playback: FragmentPlayback = {
      kind: 'fragment_radio',
      saveId: save.id,
      sessionId: save.session_template_id,
      title: save.session_templates.title,
      fragmentTitle: getSaveTitle(save),
      startSec,
      endSec,
    };
    startPlayback(playback);
  }, [startPlayback]);

  // ── Fetch + play immediately (initial start / skip) ───────────────────────

  const fetchNext = useCallback(async (excludeIds: string[]) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRadio(prev => ({ ...prev, status: 'loading', error: null }));
    try {
      const save = await fetchNextSave(excludeIds);
      if (!save) {
        setRadio(prev => ({ ...prev, status: 'error', error: 'Brak Momentów do odtworzenia.' }));
        return;
      }
      playSave(save, excludeIds);
    } catch {
      setRadio(prev => ({ ...prev, status: 'error', error: 'Błąd połączenia.' }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [fetchNextSave, playSave]);

  // ── Bumper sequence between moments ──────────────────────────────────────
  //
  // Timeline (from fragment end — audio already paused by AudioEngine):
  //   0 ms    — bumper starts (vol 0→1 over 3s), next save fetched concurrently
  //   3000ms  — bumper at full volume; hold 9s
  //   12000ms — startPlayback(nextSave); bumper fades out (vol 1→0 over 3s)
  //   15000ms — bumper audio stops
  //
  // NOTE: We intentionally do NOT call engineHandle.fadeOut() here.
  // AudioEngine already calls audio.pause() before firing fragmentListeners,
  // so by the time this callback runs the main audio is already silent.
  // Calling fadeOut would destructively zero the <audio> volume, breaking the
  // next moment's playback (AudioEngine reuses the same element).

  const playBumperThenNext = useCallback(async (excludeIds: string[]) => {
    const gen = ++bumperGenRef.current;
    const cancelled = () => bumperGenRef.current !== gen;

    const bumper = bumperRef.current;

    // 1. Fetch next save + start bumper concurrently
    const fetchPromise = fetchNextSave(excludeIds);

    let bumperPlaying = false;
    if (bumper) {
      bumper.currentTime = 0;
      bumper.volume = 0;
      try {
        await bumper.play();
        bumperPlaying = true;
      } catch {
        // File unavailable — graceful degradation: skip bumper, just transition
      }
    }

    const [nextSave] = await Promise.all([
      fetchPromise,
      bumperPlaying
        ? rampVolume(bumper!, 0, 1, BUMPER_FADE_IN_MS, cancelled)
        : Promise.resolve(),
    ]);

    if (cancelled()) {
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
      return;
    }

    // 2. Hold bumper at full volume for 9s
    if (bumperPlaying) {
      await new Promise<void>(r => setTimeout(r, BUMPER_HOLD_MS));
    }
    if (cancelled()) {
      if (bumperPlaying && bumper) { bumper.pause(); bumper.currentTime = 0; }
      return;
    }

    // 3. Start next moment; fade bumper out simultaneously (3s overlap)
    if (nextSave) {
      playSave(nextSave, excludeIds);
      // Do NOT call engineHandle.fadeIn() — AudioEngine's volume was never
      // touched (we skipped fadeOut), so the <audio> element is already at
      // full user volume.  GlobalPlayer's autoplay handler fires from
      // handleStateChange when status transitions to 'paused' (first load of
      // the new source), so playback starts automatically at normal volume.
    } else {
      setRadio(prev => ({ ...prev, status: 'error', error: 'Brak Momentów do odtworzenia.' }));
    }

    if (bumperPlaying && bumper) {
      rampVolume(bumper, 1, 0, BUMPER_FADE_OUT_MS, cancelled).then(() => {
        if (!cancelled()) { bumper.pause(); bumper.currentTime = 0; }
      });
    }
  }, [fetchNextSave, playSave]);

  // ── Auto-advance on fragment end ─────────────────────────────────────────

  useEffect(() => {
    if (!engineHandle || !isRadioActive) return;
    const unsub = engineHandle.subscribeToFragment(() => {
      playBumperThenNext(radio.excludeIds);
    });
    return unsub;
  }, [engineHandle, isRadioActive, radio.excludeIds, playBumperThenNext]);

  // ── Background-tab recovery ───────────────────────────────────────────────
  // When the tab comes back to the foreground, the bumper sequence may have
  // completed (setInterval fires sparsely in the background) but the main
  // player may still be in a stalled state.  We nudge it back to playing if
  // everything looks correct.

  useEffect(() => {
    if (!isRadioActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      // Tab just became visible.  If radio is in "playing" state but the engine
      // reports "paused" (audio element stalled), try to resume.
      if (
        radio.status === 'playing' &&
        playerState.status === 'paused' &&
        engineHandle
      ) {
        engineHandle.play();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRadioActive, radio.status, playerState.status, engineHandle]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handleStart = useCallback(
    () => fetchNext(radio.excludeIds),
    [fetchNext, radio.excludeIds],
  );

  const handlePlayPause = useCallback(() => {
    if (!engineHandle) return;
    if (isPlaying) engineHandle.pause(); else engineHandle.play();
  }, [engineHandle, isPlaying]);

  const handleSkip = useCallback(() => {
    // Cancel in-progress bumper
    bumperGenRef.current++;
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    // Fetch + start next moment immediately — no volume manipulation needed.
    // AudioEngine volume is untouched; new moment plays at normal level.
    fetchNext(radio.excludeIds);
  }, [radio.excludeIds, fetchNext]);

  const handleStop = useCallback(() => {
    // Cancel in-progress bumper
    bumperGenRef.current++;
    const b = bumperRef.current;
    if (b && !b.paused) { b.pause(); b.currentTime = 0; }
    stopPlayback();
    setRadio({ status: 'idle', current: null, excludeIds: [], error: null });
    setCurrentTime(0);
  }, [stopPlayback]);

  // ── Progress ──────────────────────────────────────────────────────────────

  const current    = radio.current;
  const rangeStart = current ? getSaveRange(current).startSec : 0;
  const rangeEnd   = current ? getSaveRange(current).endSec   : 0;
  const fragDur    = rangeEnd - rangeStart;
  const elapsed    = Math.max(0, Math.min(currentTime - rangeStart, fragDur));
  const progress   = fragDur > 0 ? (elapsed / fragDur) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const isActive = radio.status !== 'idle';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden bumper audio — preloaded so playback starts instantly */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bumperRef} src={bumperUrl} preload="auto" style={{ display: 'none' }} />

      {compact ? (
        // ── Compact mode ──────────────────────────────────────────────────────
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
                  {radio.status === 'error' ? radio.error : 'Radio Momentów'}
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
              onClick={!isActive || radio.status === 'error' ? handleStart : handlePlayPause}
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
        // ── Full mode ─────────────────────────────────────────────────────────
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
                    {radio.status === 'error' ? radio.error : 'Naciśnij ▶ aby rozpocząć radio'}
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
                  onClick={!isActive || radio.status === 'error' ? handleStart : handlePlayPause}
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

          {radio.excludeIds.length > 0 && (
            <p className="text-center text-xs text-htg-fg-muted/50 mt-4">
              Ostatnie {radio.excludeIds.length} {radio.excludeIds.length === 1 ? 'Moment' : 'Momenty'} nie powtórzy się
            </p>
          )}
        </div>
      )}
    </>
  );
}
