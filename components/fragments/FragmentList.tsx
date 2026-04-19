'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Star, Trash2, Play, Pause, Lock, Bookmark,
  Mic, Music, Loader2, Plus, Radio, CheckCircle, Tag as TagIcon,
} from 'lucide-react';
import { Link } from '@/i18n-config';
import { usePlayer } from '@/lib/player-context';
import type { FragmentPlayback, RecordingFragmentPlayback, PytaniaAnswerPlayback } from '@/lib/player-context';
import { FRAGMENT_TAGS, FRAGMENT_TAG_LABELS, type FragmentTag } from '@/lib/constants/fragment-tags';

// ---------------------------------------------------------------------------
// Types (subset of what the API returns)
// ---------------------------------------------------------------------------

interface SessionFragment {
  id: string;
  ordinal: number;
  start_sec: number;
  end_sec: number;
  title: string;
  title_i18n: Record<string, string>;
  is_impulse: boolean;
  tags?: string[];
}

interface SessionTemplate {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
}

interface UserCategory {
  id: string;
  name: string;
  color: string | null;
}

interface FragmentSave {
  id: string;
  user_id: string;
  session_template_id: string | null;
  booking_recording_id: string | null;
  fragment_type: 'predefined' | 'custom';
  session_fragment_id: string | null;
  custom_start_sec: number | null;
  custom_end_sec: number | null;
  custom_title: string | null;
  fallback_start_sec: number | null;
  fallback_end_sec: number | null;
  note: string | null;
  category_id: string | null;
  is_favorite: boolean;
  last_played_at: string | null;
  play_count: number;
  created_at: string;
  updated_at: string;
  session_fragments: SessionFragment | null;
  session_templates: SessionTemplate | null;
  user_categories: UserCategory | null;
}

interface PytaniaAnswerFragment {
  id: string;
  start_sec: number;
  end_sec: number;
  session_template_id: string;
  session_title: string;
  month_title: string | null;
}

interface PytaniaItem {
  id: string;          // question id
  title: string;       // question title
  answer_fragment: PytaniaAnswerFragment;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(sec: number): string {
  const s = Math.floor(Math.max(0, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function getSaveRange(save: FragmentSave): { startSec: number; endSec: number } {
  if (save.fragment_type === 'predefined') {
    return {
      startSec: save.fallback_start_sec ?? 0,
      endSec: save.fallback_end_sec ?? 0,
    };
  }
  return {
    startSec: save.custom_start_sec ?? 0,
    endSec: save.custom_end_sec ?? 0,
  };
}

function getSaveTitle(save: FragmentSave): string {
  if (save.custom_title) return save.custom_title;
  if (save.session_fragments?.title) return save.session_fragments.title;
  const { startSec, endSec } = getSaveRange(save);
  return `${formatTime(startSec)} – ${formatTime(endSec)}`;
}

function getSaveSourceTitle(save: FragmentSave): string {
  return save.session_templates?.title ?? 'Nagranie sesji';
}

// ---------------------------------------------------------------------------
// Virtual category IDs
// ---------------------------------------------------------------------------

const VIRTUAL_ALL = '__all__';
const VIRTUAL_FAVORITES = '__favorites__';
const VIRTUAL_RECORDINGS = '__recordings__';
const VIRTUAL_PYTANIA = '__pytania__';

// ---------------------------------------------------------------------------
// FragmentCard
// ---------------------------------------------------------------------------

interface CardProps {
  save: FragmentSave;
  accessible: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function FragmentCard({ save, accessible, onPlay, onToggleFavorite, onDelete }: CardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isRecording = !!save.booking_recording_id;
  const { startSec, endSec } = getSaveRange(save);
  const duration = endSec - startSec;

  // Play/pause state
  const { activePlayback, playerState, engineHandle } = usePlayer();
  const isActive = accessible && (
    (activePlayback?.kind === 'fragment_review' && (activePlayback as FragmentPlayback).saveId === save.id) ||
    (activePlayback?.kind === 'fragment_recording_review' && (activePlayback as RecordingFragmentPlayback).saveId === save.id)
  );
  const isPlaying = isActive && playerState.status === 'playing';

  function handlePlayPause() {
    if (!accessible) return;
    if (isActive) {
      if (isPlaying) engineHandle?.pause();
      else if (playerState.status === 'paused') engineHandle?.play();
    } else {
      onPlay();
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await fetch(`/api/fragments/saves/${save.id}`, { method: 'DELETE' }).catch(() => {});
    onDelete();
  };

  return (
    <div className={`group relative bg-htg-card border rounded-xl p-4 transition-all
                    ${accessible ? 'border-htg-card-border hover:border-htg-sage/30' : 'border-htg-card-border opacity-60'}`}>
      {/* Source label */}
      <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mb-1.5">
        {isRecording ? (
          <><Mic className="w-3 h-3 text-htg-lavender" /> Nagranie sesji</>
        ) : (
          <><Music className="w-3 h-3 text-htg-sage" /> {getSaveSourceTitle(save)}</>
        )}
        {!accessible && <Lock className="w-3 h-3 ml-auto text-htg-fg-muted" />}
      </div>

      {/* Title + range */}
      <p className="text-htg-fg font-medium text-sm mb-0.5 truncate">{getSaveTitle(save)}</p>
      <p className="text-xs text-htg-fg-muted">
        {formatTime(startSec)} – {formatTime(endSec)}
        <span className="ml-2 text-htg-fg-muted/60">({formatTime(duration)})</span>
      </p>

      {/* Note */}
      {save.note && (
        <p className="text-xs text-htg-fg-muted/70 mt-2 line-clamp-2 italic">{save.note}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          disabled={!accessible}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                     ${accessible
                       ? isPlaying
                         ? 'bg-htg-sage/80 text-white hover:bg-htg-sage'
                         : 'bg-htg-sage text-white hover:bg-htg-sage/90'
                       : 'bg-htg-surface text-htg-fg-muted cursor-not-allowed'}`}
        >
          {!accessible ? (
            <><Lock className="w-3 h-3" /> Brak dostępu</>
          ) : isPlaying ? (
            <><Pause className="w-3 h-3 fill-white" /> Pauza</>
          ) : (
            <><Play className="w-3 h-3 fill-white" /> Odtwórz</>
          )}
        </button>

        {/* Favorite toggle */}
        <button
          onClick={onToggleFavorite}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors
                     ${save.is_favorite
                       ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                       : 'text-htg-fg-muted hover:text-amber-400 hover:bg-amber-500/10'}`}
          title={save.is_favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
          <Star className={`w-3.5 h-3.5 ${save.is_favorite ? 'fill-amber-400' : ''}`} />
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Tak, usuń'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded text-xs text-htg-fg-muted hover:bg-htg-surface transition-colors"
            >
              Anuluj
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-htg-fg-muted/40
                       hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
            title="Usuń fragment"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PytaniaCard
// ---------------------------------------------------------------------------

interface PytaniaCardProps {
  item: PytaniaItem;
  onPlay: () => void;
}

function PytaniaCard({ item, onPlay }: PytaniaCardProps) {
  const f = item.answer_fragment;
  const duration = f.end_sec - f.start_sec;

  // Play/pause state
  const { activePlayback, playerState, engineHandle } = usePlayer();
  const isActive = activePlayback?.kind === 'pytania_answer' &&
    (activePlayback as PytaniaAnswerPlayback).sessionFragmentId === f.id;
  const isPlaying = isActive && playerState.status === 'playing';

  function handlePlayPause() {
    if (isActive) {
      if (isPlaying) engineHandle?.pause();
      else if (playerState.status === 'paused') engineHandle?.play();
    } else {
      onPlay();
    }
  }

  return (
    <div className={`group bg-htg-card border rounded-xl p-4 transition-all
                    ${isActive ? 'border-emerald-400/60' : 'border-htg-card-border hover:border-emerald-300/50'}`}>
      <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mb-1.5">
        <CheckCircle className="w-3 h-3 text-emerald-500" />
        {f.month_title ? `${f.month_title} · ` : ''}{f.session_title}
      </div>
      <p className="text-htg-fg font-medium text-sm mb-0.5 line-clamp-2 leading-snug">{item.title}</p>
      <p className="text-xs text-htg-fg-muted">
        {formatTime(f.start_sec)} – {formatTime(f.end_sec)}
        <span className="ml-2 text-htg-fg-muted/60">({formatTime(duration)})</span>
      </p>
      <button
        onClick={handlePlayPause}
        className={`mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                   ${isPlaying ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
      >
        {isPlaying ? (
          <><Pause className="w-3 h-3 fill-white" /> Pauza</>
        ) : (
          <><Play className="w-3 h-3 fill-white" /> Odtwórz</>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FragmentList
// ---------------------------------------------------------------------------

interface Props {
  initialSaves: FragmentSave[];
  categories: Category[];
  accessibleIds: string[];
  userId: string;
}

export default function FragmentList({ initialSaves, categories, accessibleIds, userId }: Props) {
  const { startPlayback } = usePlayer();
  const [saves, setSaves] = useState<FragmentSave[]>(initialSaves);
  const [pytaniaItems, setPytaniaItems] = useState<PytaniaItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(VIRTUAL_ALL);
  const [activeTags, setActiveTags] = useState<Set<FragmentTag>>(new Set());
  const [loadingPytania, setLoadingPytania] = useState(false);
  const accessSet = new Set(accessibleIds);

  // ── Category management ───────────────────────────────────────────────────
  const [catList, setCatList] = useState<Category[]>(categories);
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLoading, setNewCatLoading] = useState(false);
  const newCatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingCat) newCatInputRef.current?.focus();
  }, [creatingCat]);

  const handleCreateCategory = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    setNewCatLoading(true);
    try {
      const res = await fetch('/api/fragments/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.category) {
        setCatList(prev => [...prev, data.category]);
        setActiveCategory(data.category.id);
        setNewCatName('');
        setCreatingCat(false);
      }
    } finally {
      setNewCatLoading(false);
    }
  }, [newCatName]);

  // Load pytania on mount
  useEffect(() => {
    setLoadingPytania(true);
    fetch('/api/fragments/pytania-answers')
      .then(r => r.json())
      .then(d => { if (d.items) setPytaniaItems(d.items); })
      .catch(() => {})
      .finally(() => setLoadingPytania(false));
  }, []);

  // ── Filtered views ────────────────────────────────────────────────────────

  const filteredSaves = (() => {
    let base: FragmentSave[];
    switch (activeCategory) {
      case VIRTUAL_ALL:
        base = saves; break;
      case VIRTUAL_FAVORITES:
        base = saves.filter(s => s.is_favorite); break;
      case VIRTUAL_RECORDINGS:
        base = saves.filter(s => s.booking_recording_id); break;
      case VIRTUAL_PYTANIA:
        return []; // pytania shown separately
      default:
        base = saves.filter(s => s.category_id === activeCategory);
    }
    if (activeTags.size === 0) return base;
    // Match: fragment has at least one of the selected tags (OR semantics)
    return base.filter(s => {
      const tags = s.session_fragments?.tags ?? [];
      return tags.some(t => activeTags.has(t as FragmentTag));
    });
  })();

  // Count of predefined fragments per tag (across current category scope)
  const tagCounts = (() => {
    const counts: Record<string, number> = {};
    const scope = (() => {
      switch (activeCategory) {
        case VIRTUAL_ALL: return saves;
        case VIRTUAL_FAVORITES: return saves.filter(s => s.is_favorite);
        case VIRTUAL_RECORDINGS: return saves.filter(s => s.booking_recording_id);
        case VIRTUAL_PYTANIA: return [];
        default: return saves.filter(s => s.category_id === activeCategory);
      }
    })();
    for (const s of scope) {
      for (const t of s.session_fragments?.tags ?? []) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return counts;
  })();

  const totalByCategory = {
    [VIRTUAL_FAVORITES]: saves.filter(s => s.is_favorite).length,
    [VIRTUAL_RECORDINGS]: saves.filter(s => s.booking_recording_id).length,
    [VIRTUAL_PYTANIA]: pytaniaItems.length,
  } as Record<string, number>;

  for (const cat of catList) {
    totalByCategory[cat.id] = saves.filter(s => s.category_id === cat.id).length;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const handlePlay = useCallback((save: FragmentSave) => {
    const { startSec, endSec } = getSaveRange(save);
    const title = getSaveSourceTitle(save);
    const fragmentTitle = getSaveTitle(save);

    if (save.booking_recording_id) {
      const playback: RecordingFragmentPlayback = {
        kind: 'fragment_recording_review',
        saveId: save.id,
        recordingId: save.booking_recording_id,
        title,
        fragmentTitle,
        startSec,
        endSec,
      };
      startPlayback(playback);
    } else if (save.session_template_id) {
      const playback: FragmentPlayback = {
        kind: 'fragment_review',
        saveId: save.id,
        sessionId: save.session_template_id,
        title,
        fragmentTitle,
        startSec,
        endSec,
      };
      startPlayback(playback);
    }
  }, [startPlayback]);

  const handlePlayPytania = useCallback((item: PytaniaItem) => {
    const f = item.answer_fragment;
    const playback: PytaniaAnswerPlayback = {
      kind: 'pytania_answer',
      sessionFragmentId: f.id,
      sessionId: f.session_template_id,
      title: f.session_title,
      fragmentTitle: item.title,
      startSec: f.start_sec,
      endSec: f.end_sec,
    };
    startPlayback(playback);
  }, [startPlayback]);

  const handleToggleFavorite = useCallback(async (save: FragmentSave) => {
    const newVal = !save.is_favorite;
    setSaves(prev => prev.map(s => s.id === save.id ? { ...s, is_favorite: newVal } : s));
    await fetch(`/api/fragments/saves/${save.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: newVal }),
    }).catch(() => {
      // Revert on failure
      setSaves(prev => prev.map(s => s.id === save.id ? { ...s, is_favorite: !newVal } : s));
    });
  }, []);

  const handleDelete = useCallback((saveId: string) => {
    setSaves(prev => prev.filter(s => s.id !== saveId));
  }, []);

  // ── Nav items ─────────────────────────────────────────────────────────────

  const allSavesCount = saves.length;

  const navItems = [
    { id: VIRTUAL_ALL, label: 'Wszystkie', count: allSavesCount },
    { id: VIRTUAL_FAVORITES, label: '⭐ Ulubione', count: totalByCategory[VIRTUAL_FAVORITES] },
    { id: VIRTUAL_RECORDINGS, label: '🎙 Twoje Nagrania Sesji', count: totalByCategory[VIRTUAL_RECORDINGS] },
    { id: VIRTUAL_PYTANIA, label: '✅ Pytania Rozpoznane', count: totalByCategory[VIRTUAL_PYTANIA] },
    ...catList.map(cat => ({ id: cat.id, label: cat.name, count: totalByCategory[cat.id] ?? 0 })),
  ];

  // ── Empty state ───────────────────────────────────────────────────────────

  const isEmpty = activeCategory === VIRTUAL_PYTANIA
    ? pytaniaItems.length === 0
    : filteredSaves.length === 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Sidebar nav ───────────────────────────────────────────────────── */}
      <nav className="lg:w-56 shrink-0">
        <div className="sticky top-6 space-y-1">
          {/* Radio Momentów link */}
          <Link
            href="/konto/momenty/radio"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-htg-fg-muted hover:text-htg-sage hover:bg-htg-sage/5 transition-colors mb-1"
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>Radio Momentów</span>
          </Link>
          <div className="h-px bg-htg-card-border mb-1" />

          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveCategory(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between
                         ${activeCategory === item.id
                           ? 'bg-htg-sage/10 text-htg-sage font-medium'
                           : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'}`}
            >
              <span className="truncate">{item.label}</span>
              {item.count > 0 && (
                <span className={`text-xs ml-2 shrink-0 ${activeCategory === item.id ? 'text-htg-sage/70' : 'text-htg-fg-muted/50'}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}

          {/* Create category */}
          <div className="pt-2 mt-1 border-t border-htg-card-border">
            {!creatingCat ? (
              <button
                onClick={() => setCreatingCat(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nowa kategoria
              </button>
            ) : (
              <form onSubmit={handleCreateCategory} className="px-2 pt-1">
                <input
                  ref={newCatInputRef}
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setCreatingCat(false); setNewCatName(''); } }}
                  placeholder="Nazwa kategorii"
                  maxLength={100}
                  className="w-full text-sm px-2 py-1.5 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:border-htg-sage/60"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="submit"
                    disabled={newCatLoading || !newCatName.trim()}
                    className="flex-1 py-1 text-xs font-medium bg-htg-sage text-white rounded-lg disabled:opacity-50 transition-opacity"
                  >
                    {newCatLoading ? '...' : 'Utwórz'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingCat(false); setNewCatName(''); }}
                    className="px-2 py-1 text-xs text-htg-fg-muted hover:text-htg-fg rounded-lg hover:bg-htg-surface transition-colors"
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Active category header */}
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-medium text-htg-fg">
            {navItems.find(n => n.id === activeCategory)?.label ?? 'Momenty'}
          </h2>
          {activeCategory === VIRTUAL_PYTANIA && loadingPytania && (
            <Loader2 className="w-4 h-4 text-htg-fg-muted animate-spin" />
          )}
        </div>

        {/* Pytania Rozpoznane grid */}
        {activeCategory === VIRTUAL_PYTANIA && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pytaniaItems.map(item => (
              <PytaniaCard
                key={item.id}
                item={item}
                onPlay={() => handlePlayPytania(item)}
              />
            ))}
          </div>
        )}

        {/* Tag filter chips — only for predefined Moments */}
        {activeCategory !== VIRTUAL_PYTANIA && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <TagIcon className="w-3.5 h-3.5 text-htg-fg-muted shrink-0" />
            {FRAGMENT_TAGS.map(tag => {
              const count = tagCounts[tag] ?? 0;
              const active = activeTags.has(tag);
              if (count === 0 && !active) return null;
              return (
                <button
                  key={tag}
                  onClick={() => {
                    setActiveTags(prev => {
                      const next = new Set(prev);
                      if (next.has(tag)) next.delete(tag);
                      else next.add(tag);
                      return next;
                    });
                  }}
                  className={[
                    'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                    active
                      ? 'bg-htg-sage/20 border-htg-sage/40 text-htg-sage'
                      : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg',
                  ].join(' ')}
                >
                  {FRAGMENT_TAG_LABELS[tag].pl}
                  {count > 0 && (
                    <span className="ml-1 text-htg-fg-muted/60">{count}</span>
                  )}
                </button>
              );
            })}
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="text-[11px] px-2 py-0.5 text-htg-fg-muted hover:text-htg-fg transition-colors"
              >
                wyczyść
              </button>
            )}
          </div>
        )}

        {/* Saves grid */}
        {activeCategory !== VIRTUAL_PYTANIA && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredSaves.map(save => {
              const sourceId = save.session_template_id ?? save.booking_recording_id ?? '';
              const accessible = accessSet.has(sourceId);
              return (
                <FragmentCard
                  key={save.id}
                  save={save}
                  accessible={accessible}
                  onPlay={() => handlePlay(save)}
                  onToggleFavorite={() => handleToggleFavorite(save)}
                  onDelete={() => handleDelete(save.id)}
                />
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !loadingPytania && (
          <div className="text-center py-16 text-htg-fg-muted">
            {activeCategory === VIRTUAL_PYTANIA ? (
              <>
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Brak rozpoznanych pytań z przypisaną odpowiedzią.</p>
              </>
            ) : activeCategory === VIRTUAL_ALL ? (
              <>
                <Bookmark className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Nie masz jeszcze żadnych Momentów.</p>
                <p className="text-xs mt-1">Zapisz fragment sesji podczas odtwarzania, używając przycisku Zapisz Moment.</p>
              </>
            ) : activeCategory === VIRTUAL_FAVORITES ? (
              <>
                <Star className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Brak ulubionych Momentów.</p>
                <p className="text-xs mt-1">Oznacz Moment ⭐ podczas zapisywania lub na tej liście.</p>
              </>
            ) : activeCategory === VIRTUAL_RECORDINGS ? (
              <>
                <Mic className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Brak zapisanych Momentów z Twoich nagrań sesji.</p>
              </>
            ) : (
              <>
                <Bookmark className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Ta kategoria jest pusta.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
