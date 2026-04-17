'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Star, Trash2, Play, Lock, Bookmark, Zap,
  Mic, Music, Loader2, Plus, Radio, Share2, Copy, Check, X,
} from 'lucide-react';
import { Link } from '@/i18n-config';
import { usePlayer } from '@/lib/player-context';
import type { FragmentPlayback, RecordingFragmentPlayback, ImpulsePlayback } from '@/lib/player-context';

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

interface ImpulseFragment {
  id: string;
  ordinal: number;
  start_sec: number;
  end_sec: number;
  title: string;
  title_i18n: Record<string, string>;
  impulse_order: number | null;
  session_template_id: string;
  session_templates: SessionTemplate;
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
const VIRTUAL_IMPULSES = '__impulses__';

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
        {/* Play */}
        <button
          onClick={onPlay}
          disabled={!accessible}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                     ${accessible
                       ? 'bg-htg-sage text-white hover:bg-htg-sage/90'
                       : 'bg-htg-surface text-htg-fg-muted cursor-not-allowed'}`}
        >
          {accessible ? <Play className="w-3 h-3 fill-white" /> : <Lock className="w-3 h-3" />}
          {accessible ? 'Odtwórz' : 'Brak dostępu'}
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
// ImpulseCard
// ---------------------------------------------------------------------------

interface ImpulseCardProps {
  impulse: ImpulseFragment;
  onPlay: () => void;
}

function ImpulseCard({ impulse, onPlay }: ImpulseCardProps) {
  const duration = impulse.end_sec - impulse.start_sec;
  return (
    <div className="group bg-htg-card border border-htg-card-border hover:border-htg-sage/30 rounded-xl p-4 transition-all">
      <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mb-1.5">
        <Zap className="w-3 h-3 text-amber-400" />
        {impulse.session_templates.title}
      </div>
      <p className="text-htg-fg font-medium text-sm mb-0.5 truncate">{impulse.title}</p>
      <p className="text-xs text-htg-fg-muted">
        {formatTime(impulse.start_sec)} – {formatTime(impulse.end_sec)}
        <span className="ml-2 text-htg-fg-muted/60">({formatTime(duration)})</span>
      </p>
      <button
        onClick={onPlay}
        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-htg-sage text-white hover:bg-htg-sage/90 transition-colors"
      >
        <Play className="w-3 h-3 fill-white" />
        Odtwórz impuls
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategorySharePanel
// ---------------------------------------------------------------------------

interface CategorySharePanelProps {
  categoryId: string;
  hasRecordingSaves: boolean;
  onClose: () => void;
}

function CategorySharePanel({ categoryId, hasRecordingSaves, onClose }: CategorySharePanelProps) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = shareToken
    ? `${window.location.href.split('/konto')[0]}/momenty/share/${shareToken}`
    : null;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/fragments/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'Nie udało się wygenerować linku.');
      } else {
        setShareToken(data.share.share_token);
        setShareId(data.share.id);
      }
    } catch {
      setError('Błąd sieci.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!shareId) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/fragments/shares/${shareId}`, { method: 'DELETE' });
      if (res.ok) {
        setShareToken(null);
        setShareId(null);
      } else {
        setError('Nie udało się usunąć linku.');
      }
    } catch {
      setError('Błąd sieci.');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-1 mx-1 mb-1 px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-lg text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-htg-fg-muted font-medium">Udostępnij kategorię</span>
        <button
          onClick={onClose}
          className="text-htg-fg-muted/60 hover:text-htg-fg-muted transition-colors"
          aria-label="Zamknij"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {hasRecordingSaves ? (
        <p className="text-htg-fg-muted/70 text-[11px] leading-4">
          Kategoria zawiera nagrania własnych sesji — nie można udostępnić.
        </p>
      ) : shareUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 bg-htg-card border border-htg-card-border rounded px-2 py-1.5">
            <span className="flex-1 truncate text-htg-fg-muted text-[10px] font-mono">{shareUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-htg-fg-muted hover:text-htg-sage transition-colors"
              title="Kopiuj link"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-htg-sage" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="text-red-400/80 hover:text-red-400 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {revoking && <Loader2 className="w-3 h-3 animate-spin" />}
            Usuń link
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-htg-sage/10 text-htg-sage rounded-lg
                     hover:bg-htg-sage/20 transition-colors disabled:opacity-50 font-medium"
        >
          {generating && <Loader2 className="w-3 h-3 animate-spin" />}
          Generuj link
        </button>
      )}

      {error && (
        <p className="mt-1.5 text-red-400 text-[11px]">{error}</p>
      )}
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
  const [impulses, setImpulses] = useState<ImpulseFragment[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(VIRTUAL_ALL);
  const [loadingImpulses, setLoadingImpulses] = useState(false);
  const [openSharePanel, setOpenSharePanel] = useState<string | null>(null);
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

  // Load impulses on mount
  useEffect(() => {
    setLoadingImpulses(true);
    fetch('/api/fragments/impulses')
      .then(r => r.json())
      .then(d => { if (d.impulses) setImpulses(d.impulses); })
      .catch(() => {})
      .finally(() => setLoadingImpulses(false));
  }, []);

  // ── Filtered views ────────────────────────────────────────────────────────

  const filteredSaves = (() => {
    switch (activeCategory) {
      case VIRTUAL_ALL:
        return saves;
      case VIRTUAL_FAVORITES:
        return saves.filter(s => s.is_favorite);
      case VIRTUAL_RECORDINGS:
        return saves.filter(s => s.booking_recording_id);
      case VIRTUAL_IMPULSES:
        return []; // impulses shown separately
      default:
        return saves.filter(s => s.category_id === activeCategory);
    }
  })();

  const totalByCategory = {
    [VIRTUAL_FAVORITES]: saves.filter(s => s.is_favorite).length,
    [VIRTUAL_RECORDINGS]: saves.filter(s => s.booking_recording_id).length,
    [VIRTUAL_IMPULSES]: impulses.length,
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

  const handlePlayImpulse = useCallback((impulse: ImpulseFragment) => {
    const playback: ImpulsePlayback = {
      kind: 'impulse',
      sessionFragmentId: impulse.id,
      sessionId: impulse.session_template_id,
      title: impulse.session_templates.title,
      fragmentTitle: impulse.title,
      startSec: impulse.start_sec,
      endSec: impulse.end_sec,
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
    { id: VIRTUAL_IMPULSES, label: '🔥 Impuls', count: totalByCategory[VIRTUAL_IMPULSES] },
    ...catList.map(cat => ({ id: cat.id, label: cat.name, count: totalByCategory[cat.id] ?? 0 })),
  ];

  // ── Empty state ───────────────────────────────────────────────────────────

  const isEmpty = activeCategory === VIRTUAL_IMPULSES
    ? impulses.length === 0
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

          {navItems.map(item => {
            const isUserCat = !item.id.startsWith('__');
            const catSaves = isUserCat ? saves.filter(s => s.category_id === item.id) : [];
            const hasRecordingSaves = catSaves.some(s => s.booking_recording_id !== null);
            const isShareOpen = openSharePanel === item.id;

            return (
              <div key={item.id}>
                <div className={`group/cat flex items-center rounded-lg transition-colors
                                ${activeCategory === item.id
                                  ? 'bg-htg-sage/10'
                                  : 'hover:bg-htg-surface'}`}>
                  <button
                    onClick={() => setActiveCategory(item.id)}
                    className={`flex-1 text-left px-3 py-2 text-sm transition-colors flex items-center justify-between min-w-0
                               ${activeCategory === item.id
                                 ? 'text-htg-sage font-medium'
                                 : 'text-htg-fg-muted hover:text-htg-fg'}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.count > 0 && (
                      <span className={`text-xs ml-2 shrink-0 ${activeCategory === item.id ? 'text-htg-sage/70' : 'text-htg-fg-muted/50'}`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                  {isUserCat && (
                    <button
                      onClick={() => setOpenSharePanel(isShareOpen ? null : item.id)}
                      className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg mr-1
                                  transition-colors opacity-0 group-hover/cat:opacity-100 focus:opacity-100
                                  ${isShareOpen
                                    ? 'text-htg-sage opacity-100'
                                    : 'text-htg-fg-muted/60 hover:text-htg-sage hover:bg-htg-sage/10'}`}
                      title="Udostępnij kategorię"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isUserCat && isShareOpen && (
                  <CategorySharePanel
                    categoryId={item.id}
                    hasRecordingSaves={hasRecordingSaves}
                    onClose={() => setOpenSharePanel(null)}
                  />
                )}
              </div>
            );
          })}

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
          {activeCategory === VIRTUAL_IMPULSES && loadingImpulses && (
            <Loader2 className="w-4 h-4 text-htg-fg-muted animate-spin" />
          )}
        </div>

        {/* Impulse grid */}
        {activeCategory === VIRTUAL_IMPULSES && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {impulses.map(impulse => (
              <ImpulseCard
                key={impulse.id}
                impulse={impulse}
                onPlay={() => handlePlayImpulse(impulse)}
              />
            ))}
          </div>
        )}

        {/* Saves grid */}
        {activeCategory !== VIRTUAL_IMPULSES && (
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
        {isEmpty && !loadingImpulses && (
          <div className="text-center py-16 text-htg-fg-muted">
            {activeCategory === VIRTUAL_IMPULSES ? (
              <>
                <Zap className="w-10 h-10 mx-auto mb-3 text-htg-fg-muted/30" />
                <p className="text-sm">Brak impulsów. Administrator jeszcze ich nie dodał.</p>
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
