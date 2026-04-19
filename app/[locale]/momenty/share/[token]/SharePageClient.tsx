'use client';

import { useState, useCallback } from 'react';
import { Play, Pause, Bookmark, BookmarkPlus, Music, Check, Clock } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import type { FragmentPlayback } from '@/lib/player-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SharedSave {
  id: string;
  title: string;
  start_sec: number;
  end_sec: number;
  duration: number;
  session_title: string;
  session_slug: string | null;
  session_template_id: string | null;
}

interface Props {
  shareToken: string;
  categoryName: string;
  categoryColor: string | null;
  canResave: boolean;
  expiresAt: string | null;
  saves: SharedSave[];
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const s = Math.floor(Math.max(0, sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
  const s = Math.floor(Math.max(0, sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return ss > 0 ? `${m}m ${ss}s` : `${m}m`;
}

// ── SaveButton ────────────────────────────────────────────────────────────────

function SaveButton({ save, shareToken }: { save: SharedSave; shareToken: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSave = async () => {
    if (state !== 'idle') return;
    setState('saving');
    try {
      const res = await fetch('/api/fragments/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'custom',
          source: 'session_template',
          source_id: save.session_template_id,
          start_sec: save.start_sec,
          end_sec: save.end_sec,
          custom_title: save.title,
          shareToken,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setState('saved');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
        <Check className="w-3 h-3" /> Zapisano
      </span>
    );
  }

  return (
    <button
      onClick={handleSave}
      disabled={state === 'saving'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                 text-htg-fg-muted hover:text-htg-sage hover:bg-htg-sage/10 transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Zapisz do moich Momentów"
    >
      <BookmarkPlus className="w-3.5 h-3.5" />
      {state === 'saving' ? 'Zapisywanie…' : 'Zapisz'}
    </button>
  );
}

// ── SharedFragmentCard ────────────────────────────────────────────────────────

function SharedFragmentCard({
  save,
  shareToken,
  canResave,
}: {
  save: SharedSave;
  shareToken: string;
  canResave: boolean;
}) {
  const { activePlayback, playerState, engineHandle, startPlayback } = usePlayer();

  const isActive =
    activePlayback?.kind === 'fragment_review' &&
    (activePlayback as FragmentPlayback).saveId === save.id;
  const isPlaying = isActive && playerState.status === 'playing';

  const handlePlayPause = useCallback(() => {
    if (isActive) {
      if (isPlaying) engineHandle?.pause();
      else engineHandle?.play();
      return;
    }
    if (!save.session_template_id) return;
    const playback: FragmentPlayback = {
      kind: 'fragment_review',
      saveId: save.id,
      sessionId: save.session_template_id,
      title: save.session_title,
      fragmentTitle: save.title,
      startSec: save.start_sec,
      endSec: save.end_sec,
      shareToken,
    };
    startPlayback(playback);
  }, [isActive, isPlaying, engineHandle, save, shareToken, startPlayback]);

  return (
    <div className={`group bg-htg-card border rounded-xl p-4 transition-all
                    ${isActive
                      ? 'border-htg-sage/40 ring-1 ring-htg-sage/20'
                      : 'border-htg-card-border hover:border-htg-sage/30'}`}>
      {/* Source label */}
      <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mb-1.5">
        <Music className="w-3 h-3 text-htg-sage" />
        <span className="truncate">{save.session_title}</span>
      </div>

      {/* Title + range */}
      <p className="text-htg-fg font-medium text-sm mb-0.5 truncate">{save.title}</p>
      <p className="text-xs text-htg-fg-muted">
        {formatTime(save.start_sec)} – {formatTime(save.end_sec)}
        <span className="ml-2 text-htg-fg-muted/60">({formatDuration(save.duration)})</span>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handlePlayPause}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                     ${isPlaying
                       ? 'bg-htg-sage/80 text-white hover:bg-htg-sage'
                       : 'bg-htg-sage text-white hover:bg-htg-sage/90'}`}
        >
          {isPlaying ? (
            <><Pause className="w-3 h-3 fill-white" /> Pauza</>
          ) : (
            <><Play className="w-3 h-3 fill-white" /> Odtwórz</>
          )}
        </button>

        {canResave && save.session_template_id && (
          <SaveButton save={save} shareToken={shareToken} />
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SharePageClient({
  shareToken,
  categoryName,
  categoryColor,
  canResave,
  expiresAt,
  saves,
}: Props) {
  const accentStyle = categoryColor
    ? { borderColor: `${categoryColor}40`, backgroundColor: `${categoryColor}10` }
    : {};

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiryDate
    ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div
          className="w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0"
          style={categoryColor
            ? { ...accentStyle, borderColor: `${categoryColor}50` }
            : { backgroundColor: 'var(--htg-sage-10)', borderColor: 'transparent' }}
        >
          <Bookmark
            className="w-5 h-5"
            style={categoryColor ? { color: categoryColor } : { color: 'var(--color-htg-sage)' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-htg-fg-muted mb-0.5 font-medium uppercase tracking-wider">
            Udostępniona kolekcja
          </p>
          <h1 className="text-xl font-semibold text-htg-fg truncate">{categoryName}</h1>
          <p className="text-sm text-htg-fg-muted mt-0.5">
            {saves.length} {saves.length === 1 ? 'Moment' : saves.length < 5 ? 'Momenty' : 'Momentów'}
            {canResave && (
              <span className="ml-2 text-htg-sage">· możesz zapisywać do swoich Momentów</span>
            )}
          </p>
        </div>
      </div>

      {/* Expiry notice */}
      {daysLeft !== null && daysLeft <= 7 && (
        <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-6">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {daysLeft <= 0
              ? 'Link wygasa dzisiaj'
              : daysLeft === 1
              ? 'Link wygasa jutro'
              : `Link wygasa za ${daysLeft} dni`}
          </span>
        </div>
      )}

      {/* Fragment list */}
      {saves.length === 0 ? (
        <div className="text-center py-16 text-htg-fg-muted">
          <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Ta kolekcja jest pusta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {saves.map(save => (
            <SharedFragmentCard
              key={save.id}
              save={save}
              shareToken={shareToken}
              canResave={canResave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
