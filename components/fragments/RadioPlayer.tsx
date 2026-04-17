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

const NON_REPEAT_WINDOW = 5;

// ---------------------------------------------------------------------------
// RadioPlayer
// ---------------------------------------------------------------------------

interface Props {
  scope: RadioScope;
  scopeId?: string;
  scopeLabel?: string;
}

export default function RadioPlayer({ scope, scopeId, scopeLabel }: Props) {
  const { activePlayback, playerState, engineHandle, startPlayback, stopPlayback } = usePlayer();
  const [radio, setRadio] = useState<RadioState>({
    status: 'idle',
    current: null,
    excludeIds: [],
    error: null,
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const isFetchingRef = useRef(false);

  const isRadioActive =
    activePlayback?.kind === 'fragment_radio' ||
    activePlayback?.kind === 'fragment_review';
  const isPlaying = playerState.status === 'playing' && isRadioActive;
  const isLoading = radio.status === 'loading' || (playerState.status === 'loading' && isRadioActive);

  // Subscribe to time/duration for the mini-progress
  useEffect(() => {
    if (!engineHandle || !isRadioActive) return;
    const unsubT = engineHandle.subscribeToTime(setCurrentTime);
    const unsubD = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubT(); unsubD(); };
  }, [engineHandle, isRadioActive]);

  // ── Fetch next fragment ───────────────────────────────────────────────────

  const fetchNext = useCallback(async (excludeIds: string[], retry = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    setRadio(prev => ({ ...prev, status: 'loading', error: null }));

    try {
      const res = await fetch('/api/fragments/radio/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, scopeId, excludeIds }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRadio(prev => ({ ...prev, status: 'error', error: data.error || 'Błąd serwera' }));
        return;
      }

      if (!data.save) {
        if (!retry) {
          // Pool exhausted — reset and retry with empty window
          isFetchingRef.current = false;
          fetchNext([], true);
          return;
        }
        setRadio(prev => ({ ...prev, status: 'error', error: 'Brak fragmentów do odtworzenia.' }));
        return;
      }

      const save: RadioSave = data.save;
      const newExcludes = [...excludeIds, save.id].slice(-NON_REPEAT_WINDOW);

      setRadio(prev => ({
        ...prev,
        status: 'playing',
        current: save,
        excludeIds: newExcludes,
      }));

      // Start playback via PlayerContext
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
    } catch {
      setRadio(prev => ({ ...prev, status: 'error', error: 'Błąd połączenia.' }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [scope, scopeId, startPlayback]);

  // ── Auto-advance when fragment ends ──────────────────────────────────────

  useEffect(() => {
    if (!engineHandle || !isRadioActive) return;
    const unsub = engineHandle.subscribeToFragment(() => {
      // Fragment boundary hit — fade out then fetch next
      engineHandle.fadeOut(400);
      setTimeout(() => {
        fetchNext(radio.excludeIds);
      }, 450);
    });
    return unsub;
  }, [engineHandle, isRadioActive, radio.excludeIds, fetchNext]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    fetchNext(radio.excludeIds);
  }, [fetchNext, radio.excludeIds]);

  const handlePlayPause = useCallback(() => {
    if (!engineHandle) return;
    if (isPlaying) {
      engineHandle.pause();
    } else {
      engineHandle.play();
    }
  }, [engineHandle, isPlaying]);

  const handleSkip = useCallback(() => {
    engineHandle?.fadeOut(300);
    setTimeout(() => {
      fetchNext(radio.excludeIds);
    }, 350);
  }, [engineHandle, radio.excludeIds, fetchNext]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setRadio({ status: 'idle', current: null, excludeIds: [], error: null });
    setCurrentTime(0);
    setDuration(null);
  }, [stopPlayback]);

  // ── Progress ───────────────────────────────────────────────────────────────

  const current = radio.current;
  const startSec = current ? getSaveRange(current).startSec : 0;
  const endSec = current ? getSaveRange(current).endSec : 0;
  const fragmentDuration = endSec - startSec;
  const elapsed = Math.max(0, Math.min(currentTime - startSec, fragmentDuration));
  const progress = fragmentDuration > 0 ? (elapsed / fragmentDuration) * 100 : 0;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
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

      {/* Player card */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-htg-sage transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6">
          {/* Current fragment info */}
          {current ? (
            <div className="mb-6 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-htg-fg-muted mb-2">
                <Music className="w-3 h-3" />
                <span>{current.session_templates.title}</span>
              </div>
              <p className="text-htg-fg font-medium text-base">{getSaveTitle(current)}</p>
              <p className="text-xs text-htg-fg-muted mt-1">
                {fmt(elapsed)} / {fmt(fragmentDuration)}
              </p>
            </div>
          ) : (
            <div className="mb-6 text-center">
              <div className="w-16 h-16 bg-htg-surface rounded-full flex items-center justify-center mx-auto mb-3">
                <Radio className="w-7 h-7 text-htg-fg-muted" />
              </div>
              <p className="text-htg-fg-muted text-sm">
                {radio.status === 'error'
                  ? radio.error
                  : 'Naciśnij ▶ aby rozpocząć radio'}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Stop (only when active) */}
            {radio.status !== 'idle' && (
              <button
                onClick={handleStop}
                className="w-10 h-10 flex items-center justify-center rounded-full
                           text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface transition-colors"
                title="Zatrzymaj radio"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Play / Start */}
            <button
              onClick={radio.status === 'idle' || radio.status === 'error' ? handleStart : handlePlayPause}
              disabled={isLoading}
              className="w-16 h-16 flex items-center justify-center rounded-full
                         bg-htg-sage text-white hover:bg-htg-sage/90
                         disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-lg shadow-htg-sage/20 transition-all"
              aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-1" />
              )}
            </button>

            {/* Skip (only when active) */}
            {radio.status !== 'idle' && (
              <button
                onClick={handleSkip}
                disabled={isLoading}
                className="w-10 h-10 flex items-center justify-center rounded-full
                           text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface
                           disabled:opacity-30 transition-colors"
                title="Pomiń"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Non-repeat indicator */}
      {radio.excludeIds.length > 0 && (
        <p className="text-center text-xs text-htg-fg-muted/50 mt-4">
          Ostatnie {radio.excludeIds.length} {radio.excludeIds.length === 1 ? 'Moment' : 'Momenty'} nie powtórzy się
        </p>
      )}
    </div>
  );
}
