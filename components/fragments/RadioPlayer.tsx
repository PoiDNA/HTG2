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
  /** Compact mode — horizontal card for embedding in widgets/sidebars */
  compact?: boolean;
}

export default function RadioPlayer({ scope, scopeId, scopeLabel, compact = false }: Props) {
  const { activePlayback, playerState, engineHandle, startPlayback, stopPlayback } = usePlayer();
  const [radio, setRadio] = useState<RadioState>({
    status: 'idle',
    current: null,
    excludeIds: [],
    error: null,
  });
  const [currentTime, setCurrentTime] = useState(0);
  const isFetchingRef = useRef(false);

  // Reset when scope/scopeId changes
  const prevScopeKey = useRef(`${scope}:${scopeId}`);
  useEffect(() => {
    const key = `${scope}:${scopeId}`;
    if (key !== prevScopeKey.current) {
      prevScopeKey.current = key;
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
          isFetchingRef.current = false;
          fetchNext([], true);
          return;
        }
        setRadio(prev => ({ ...prev, status: 'error', error: 'Brak Momentów do odtworzenia.' }));
        return;
      }

      const save: RadioSave = data.save;
      const newExcludes = [...excludeIds, save.id].slice(-NON_REPEAT_WINDOW);

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
    } catch {
      setRadio(prev => ({ ...prev, status: 'error', error: 'Błąd połączenia.' }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [scope, scopeId, startPlayback]);

  // ── Auto-advance on fragment end ─────────────────────────────────────────

  useEffect(() => {
    if (!engineHandle || !isRadioActive) return;
    const unsub = engineHandle.subscribeToFragment(() => {
      engineHandle.fadeOut(400);
      setTimeout(() => fetchNext(radio.excludeIds), 450);
    });
    return unsub;
  }, [engineHandle, isRadioActive, radio.excludeIds, fetchNext]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handleStart  = useCallback(() => fetchNext(radio.excludeIds), [fetchNext, radio.excludeIds]);
  const handlePlayPause = useCallback(() => {
    if (!engineHandle) return;
    if (isPlaying) engineHandle.pause(); else engineHandle.play();
  }, [engineHandle, isPlaying]);
  const handleSkip = useCallback(() => {
    engineHandle?.fadeOut(300);
    setTimeout(() => fetchNext(radio.excludeIds), 350);
  }, [engineHandle, radio.excludeIds, fetchNext]);
  const handleStop = useCallback(() => {
    stopPlayback();
    setRadio({ status: 'idle', current: null, excludeIds: [], error: null });
    setCurrentTime(0);
  }, [stopPlayback]);

  // ── Progress ──────────────────────────────────────────────────────────────

  const current = radio.current;
  const rangeStart = current ? getSaveRange(current).startSec : 0;
  const rangeEnd   = current ? getSaveRange(current).endSec   : 0;
  const fragDur    = rangeEnd - rangeStart;
  const elapsed    = Math.max(0, Math.min(currentTime - rangeStart, fragDur));
  const progress   = fragDur > 0 ? (elapsed / fragDur) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const isActive = radio.status !== 'idle';

  // ── Compact mode ──────────────────────────────────────────────────────────

  if (compact) {
    return (
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
            <button onClick={handleStop} title="Zatrzymaj"
              className="w-7 h-7 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={!isActive || radio.status === 'error' ? handleStart : handlePlayPause}
            disabled={isLoading}
            aria-label={isPlaying ? 'Pauza' : 'Odtwórz radio'}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-htg-sage text-white hover:bg-htg-sage/90 disabled:opacity-50 shadow-sm shadow-htg-sage/20 transition-all shrink-0">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {isActive && (
            <button onClick={handleSkip} disabled={isLoading} title="Pomiń"
              className="w-7 h-7 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface disabled:opacity-30 transition-colors shrink-0">
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────

  return (
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
              <button onClick={handleStop} title="Zatrzymaj radio"
                className="w-10 h-10 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={!isActive || radio.status === 'error' ? handleStart : handlePlayPause}
              disabled={isLoading}
              aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
              className="w-16 h-16 flex items-center justify-center rounded-full bg-htg-sage text-white hover:bg-htg-sage/90 disabled:opacity-50 shadow-lg shadow-htg-sage/20 transition-all">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </button>

            {isActive && (
              <button onClick={handleSkip} disabled={isLoading} title="Pomiń"
                className="w-10 h-10 flex items-center justify-center rounded-full text-htg-fg-muted/50 hover:text-htg-fg-muted hover:bg-htg-surface disabled:opacity-30 transition-colors">
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
  );
}
