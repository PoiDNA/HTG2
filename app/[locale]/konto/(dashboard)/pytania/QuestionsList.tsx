'use client';

import { useState, useTransition } from 'react';
import { ThumbsUp, MessageSquare, CheckCircle, Clock, ChevronRight, Play } from 'lucide-react';
import { Link } from '@/i18n-config';
import { usePlayer } from '@/lib/player-context';

export interface AnswerFragment {
  id: string;
  title: string;
  start_sec: number;
  end_sec: number;
  session_template_id: string;
  session_title: string;
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
  const { startPlayback } = usePlayer();

  function playFragment(fragment: AnswerFragment, questionTitle: string) {
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
          {[['', 'Wszystkie'], ['oczekujace', 'Oczekujące'], ['rozpoznane', 'Rozpoznane']] .map(([val, label]) => (
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

              {/* Answer fragment — plays inline via global player */}
              {q.status === 'rozpoznane' && q.answer_fragment && (
                <button
                  onClick={() => playFragment(q.answer_fragment!, q.title)}
                  className="mt-3 w-full flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-100 transition-colors group text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 transition-colors">
                    <Play className="w-4 h-4 text-white fill-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider leading-none mb-0.5">Odpowiedź w nagraniu</p>
                    <p className="text-sm text-emerald-900 truncate">{q.answer_fragment.title}</p>
                  </div>
                  <span className="text-xs text-emerald-600 shrink-0">
                    {Math.floor(q.answer_fragment.start_sec / 60)}:{String(Math.floor(q.answer_fragment.start_sec % 60)).padStart(2, '0')}
                  </span>
                </button>
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
