'use client';

import { useState, useTransition } from 'react';
import {
  ThumbsUp, MessageSquare, CheckCircle, Clock, ChevronRight,
  Play, Pause, Bookmark, BookmarkCheck, X, Loader2,
} from 'lucide-react';
import { Link } from '@/i18n-config';
import { usePlayer } from '@/lib/player-context';
import type { PytaniaAnswerPlayback } from '@/lib/player-context';

export interface AnswerFragment {
  id: string;
  title: string;
  start_sec: number;
  end_sec: number;
  session_template_id: string;
  session_title: string;
  /** Human-readable month name from monthly_sets.title, e.g. "Marzec 2026" */
  month_title: string | null;
}

export interface QuestionItem {
  id: string;
  title: string;
  body: string | null;
  status: 'oczekujace' | 'rozpoznane';
  likes_count: number;
  comments_count: number;
  user_has_liked: boolean;
  created_at: string;
  author: { display_name: string | null; avatar_url: string | null } | null;
  answer_fragment: AnswerFragment | null;
}

// ---------------------------------------------------------------------------
// AnswerFragmentCard
// ---------------------------------------------------------------------------
// Handles play/pause toggle and save-to-Moments per answer fragment.
// Defined at module level (not inside QuestionsList) so it is stable
// across renders and can manage its own local state safely.

interface AnswerFragmentCardProps {
  fragment: AnswerFragment;
  questionTitle: string;
}

function AnswerFragmentCard({ fragment, questionTitle }: AnswerFragmentCardProps) {
  const { activePlayback, playerState, engineHandle, startPlayback } = usePlayer();

  // Is this specific fragment the one currently loaded in the player?
  const isActive =
    activePlayback?.kind === 'pytania_answer' &&
    (activePlayback as PytaniaAnswerPlayback).sessionFragmentId === fragment.id;
  const isThisPlaying = isActive && playerState.status === 'playing';

  // Per-card save state
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'already' | 'noaccess' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showSave, setShowSave] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [catId, setCatId] = useState('');
  const [catsLoading, setCatsLoading] = useState(false);

  // ── Play / Pause ──────────────────────────────────────────────────────────

  function handlePlayPause() {
    if (isActive) {
      if (isThisPlaying) {
        engineHandle?.pause();
      } else if (playerState.status === 'paused') {
        engineHandle?.play();
      }
      // 'loading' → ignore (player is busy)
    } else {
      startPlayback({
        kind: 'pytania_answer',
        sessionFragmentId: fragment.id,
        sessionId: fragment.session_template_id,
        title: fragment.session_title,
        fragmentTitle: questionTitle,
        startSec: fragment.start_sec,
        endSec: fragment.end_sec,
      });
    }
  }

  // ── Save panel ────────────────────────────────────────────────────────────

  async function openSaveMenu() {
    if (saveStatus === 'saved' || saveStatus === 'already') return;
    const next = !showSave;
    setShowSave(next);
    if (next && categories.length === 0 && !catsLoading) {
      setCatsLoading(true);
      try {
        const res = await fetch('/api/fragments/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories ?? []);
        }
      } finally {
        setCatsLoading(false);
      }
    }
  }

  async function handleSave() {
    setSaveStatus('saving');
    try {
      const body: Record<string, unknown> = {
        session_template_id: fragment.session_template_id,
        fragment_type: 'predefined',
        session_fragment_id: fragment.id,
        fallback_start_sec: fragment.start_sec,
        fallback_end_sec: fragment.end_sec,
      };
      if (catId) body.category_id = catId;

      const res = await fetch('/api/fragments/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        setSaveStatus('already');
        setShowSave(false);
      } else if (res.status === 403) {
        setSaveStatus('noaccess');
      } else if (res.ok) {
        setSaveStatus('saved');
        setShowSave(false);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }

  const isSaved = saveStatus === 'saved' || saveStatus === 'already';
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 overflow-hidden">
      {/* Main row — clicking the row plays/pauses */}
      <div className="flex items-center gap-3 bg-emerald-50 px-3 py-2.5 hover:bg-emerald-100/70 transition-colors">
        {/* Play / Pause button */}
        <button
          onClick={handlePlayPause}
          aria-label={isThisPlaying ? 'Pauza' : 'Odtwórz odpowiedź'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            isThisPlaying
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-emerald-500 hover:bg-emerald-600'
          }`}
        >
          {isThisPlaying
            ? <Pause className="w-3.5 h-3.5 text-white fill-white" />
            : <Play className="w-3.5 h-3.5 text-white fill-white" />}
        </button>

        {/* Text info */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider leading-none mb-1">
            Odpowiedź w nagraniu
          </p>
          {fragment.month_title && (
            <p className="text-[11px] text-emerald-600/70 leading-none mb-0.5">{fragment.month_title}</p>
          )}
          <p className="text-sm text-emerald-900 truncate font-medium">{fragment.session_title}</p>
        </div>

        {/* Timestamp */}
        <span className="text-xs text-emerald-600 shrink-0 font-mono">{fmt(fragment.start_sec)}</span>

        {/* Bookmark / save button */}
        <button
          onClick={openSaveMenu}
          title={isSaved ? 'Zapisano w Momentach' : 'Zapisz jako Moment'}
          aria-label={isSaved ? 'Zapisano w Momentach' : 'Zapisz jako Moment'}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            isSaved
              ? 'text-emerald-600 cursor-default'
              : 'text-emerald-400 hover:text-emerald-700 hover:bg-emerald-200/60'
          }`}
        >
          {isSaved
            ? <BookmarkCheck className="w-4 h-4" />
            : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* Save panel — expanded below the main row */}
      {showSave && (
        <div className="bg-white border-t border-emerald-200 px-3 py-2">
          {saveStatus === 'noaccess' ? (
            <p className="text-xs text-amber-700">
              Zapisywanie Momentów wymaga aktywnej subskrypcji Momentów.
            </p>
          ) : saveStatus === 'error' ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-600 flex-1">Błąd zapisu. Spróbuj ponownie.</p>
              <button onClick={() => { setSaveStatus('idle'); }} className="text-xs text-htg-fg-muted hover:text-htg-fg underline">
                Resetuj
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-htg-fg-muted shrink-0">Kategoria:</span>
              {catsLoading ? (
                <span className="text-xs text-htg-fg-muted/60 flex-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…
                </span>
              ) : (
                <select
                  value={catId}
                  onChange={e => setCatId(e.target.value)}
                  className="flex-1 text-xs border border-htg-card-border rounded px-1.5 py-1 bg-htg-surface text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage min-w-0"
                >
                  <option value="">Bez kategorii</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving' || catsLoading}
                className="text-xs px-3 py-1 bg-htg-sage text-white rounded hover:bg-htg-sage/90 disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1"
              >
                {saveStatus === 'saving'
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Zapis…</>
                  : 'Zapisz'}
              </button>
              <button
                onClick={() => setShowSave(false)}
                aria-label="Zamknij"
                className="text-htg-fg-muted/50 hover:text-htg-fg-muted shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionsList
// ---------------------------------------------------------------------------

interface Props {
  initialItems: QuestionItem[];
  initialSort: string;
  initialStatus: string;
}

export default function QuestionsList({ initialItems, initialSort, initialStatus }: Props) {
  const [items, setItems] = useState<QuestionItem[]>(initialItems);
  const [sort, setSort] = useState(initialSort);
  const [status, setStatus] = useState(initialStatus);
  const [, startTransition] = useTransition();

  async function refetch(newSort: string, newStatus: string) {
    const params = new URLSearchParams({ sort: newSort });
    if (newStatus) params.set('status', newStatus);
    const res = await fetch(`/api/pytania?${params}`);
    if (res.ok) {
      const json = await res.json();
      setItems(json.items ?? []);
    }
  }

  function changeSort(newSort: string) {
    setSort(newSort);
    startTransition(() => { refetch(newSort, status); });
  }

  function changeStatus(newStatus: string) {
    setStatus(newStatus);
    startTransition(() => { refetch(sort, newStatus); });
  }

  async function toggleLike(id: string) {
    const res = await fetch(`/api/pytania/${id}/like`, { method: 'POST' });
    if (!res.ok) return;
    const { action } = await res.json();
    setItems(prev => prev.map(q => {
      if (q.id !== id) return q;
      const delta = action === 'added' ? 1 : -1;
      return { ...q, likes_count: q.likes_count + delta, user_has_liked: action === 'added' };
    }));
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex rounded-lg border border-htg-card-border overflow-hidden text-sm">
          {(['new', 'likes', 'comments'] as const).map(s => (
            <button
              key={s}
              onClick={() => changeSort(s)}
              className={`px-3 py-1.5 transition-colors ${sort === s ? 'bg-htg-sage text-white' : 'text-htg-fg-muted hover:bg-htg-surface'}`}
            >
              {s === 'new' ? 'Najnowsze' : s === 'likes' ? 'Polubienia' : 'Komentarze'}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-htg-card-border overflow-hidden text-sm">
          {[['', 'Wszystkie'], ['oczekujace', 'Oczekujące'], ['rozpoznane', 'Rozpoznane']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => changeStatus(val)}
              className={`px-3 py-1.5 transition-colors ${status === val ? 'bg-htg-sage text-white' : 'text-htg-fg-muted hover:bg-htg-surface'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-htg-fg-muted">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Brak pytań w tej kategorii</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(q => (
            <div key={q.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4 hover:border-htg-sage/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {q.status === 'rozpoznane' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Rozpoznane
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-htg-fg-muted bg-htg-surface px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Oczekujące
                      </span>
                    )}
                  </div>
                  <Link href={{ pathname: '/konto/pytania/[id]', params: { id: q.id } }} className="block">
                    <h3 className="font-medium text-htg-fg leading-snug hover:text-htg-sage transition-colors line-clamp-2">
                      {q.title}
                    </h3>
                  </Link>
                  {q.body && (
                    <p className="text-sm text-htg-fg-muted mt-1 line-clamp-2">{q.body}</p>
                  )}
                  <p className="text-xs text-htg-fg-muted/60 mt-2">
                    {q.author?.display_name ?? 'Uczestnik'} · {new Date(q.created_at).toLocaleDateString('pl-PL')}
                  </p>
                </div>
                <Link href={{ pathname: '/konto/pytania/[id]', params: { id: q.id } }} className="shrink-0 text-htg-fg-muted/40 hover:text-htg-sage transition-colors mt-1">
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>

              {/* Answer fragment — play/pause + save */}
              {q.status === 'rozpoznane' && q.answer_fragment && (
                <AnswerFragmentCard
                  fragment={q.answer_fragment}
                  questionTitle={q.title}
                />
              )}

              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-htg-card-border">
                <button
                  onClick={() => toggleLike(q.id)}
                  className={`flex items-center gap-1.5 text-sm transition-colors ${q.user_has_liked ? 'text-htg-sage' : 'text-htg-fg-muted hover:text-htg-sage'}`}
                >
                  <ThumbsUp className={`w-4 h-4 ${q.user_has_liked ? 'fill-htg-sage' : ''}`} />
                  {q.likes_count}
                </button>
                <Link href={{ pathname: '/konto/pytania/[id]', params: { id: q.id } }} className="flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-sage transition-colors">
                  <MessageSquare className="w-4 h-4" />
                  {q.comments_count}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
