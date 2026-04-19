'use client';

import { useState } from 'react';
import { ThumbsUp, MessageSquare, CheckCircle, Clock, ChevronDown, ChevronUp, Search } from 'lucide-react';

interface QuestionItem {
  id: string;
  title: string;
  body: string | null;
  status: 'oczekujace' | 'rozpoznane';
  likes_count: number;
  comments_count: number;
  answer_fragment_id: string | null;
  created_at: string;
  author: { display_name: string | null; email: string | null } | null;
}

interface FragmentOption {
  id: string;
  title: string;
  start_sec: number;
  end_sec: number;
  session_id: string;
  session_title: string;
  session_order: number | null;
  month_title: string | null;
  is_pytania: boolean;
}

interface Props {
  items: QuestionItem[];
  fragmentOptions: FragmentOption[];
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function sessionLabel(f: FragmentOption): string {
  return f.month_title ? `${f.month_title} · ${f.session_title}` : f.session_title;
}

function QuestionRow({ question, fragmentOptions }: { question: QuestionItem; fragmentOptions: FragmentOption[] }) {
  const [status, setStatus] = useState(question.status);
  const [fragmentId, setFragmentId] = useState(question.answer_fragment_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Fragment picker state
  const [catalogOnly, setCatalogOnly] = useState(true);
  const [sessionFilter, setSessionFilter] = useState('');

  const isResolved = status === 'rozpoznane';

  // Unique sessions from all fragments (for dropdown)
  const sessions = Array.from(
    new Map(fragmentOptions.map(f => [f.session_id, { id: f.session_id, label: sessionLabel(f) }])).values()
  ).sort((a, b) => a.label.localeCompare(b.label, 'pl'));

  // Filtered fragments for the select
  const displayFragments = fragmentOptions.filter(f => {
    if (catalogOnly && !f.is_pytania) return false;
    if (sessionFilter && f.session_id !== sessionFilter) return false;
    return true;
  });

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { status };
    if (status === 'rozpoznane' && fragmentId) body.answer_fragment_id = fragmentId;
    const res = await fetch(`/api/pytania/${question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? 'Błąd zapisu');
    }
  }

  return (
    <div className={`border rounded-xl p-4 transition-colors ${isResolved ? 'border-emerald-200 bg-emerald-50/30' : 'border-htg-card-border bg-htg-card'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isResolved ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                <CheckCircle className="w-3 h-3" /> Rozpoznane
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-htg-fg-muted bg-htg-surface px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> Oczekujące
              </span>
            )}
            <span className="text-xs text-htg-fg-muted/60 flex items-center gap-2">
              <ThumbsUp className="w-3 h-3" /> {question.likes_count}
              <MessageSquare className="w-3 h-3" /> {question.comments_count}
            </span>
          </div>
          <p className="font-medium text-htg-fg text-sm leading-snug">{question.title}</p>
          {question.body && (
            <p className="text-xs text-htg-fg-muted mt-0.5 line-clamp-1">{question.body}</p>
          )}
          <p className="text-xs text-htg-fg-muted/50 mt-1">
            {question.author?.display_name ?? question.author?.email ?? '?'} · {new Date(question.created_at).toLocaleDateString('pl-PL')}
          </p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 text-htg-fg-muted hover:text-htg-fg transition-colors p-1"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-htg-card-border space-y-3">
          <div>
            <label className="text-xs font-medium text-htg-fg-muted uppercase tracking-wider block mb-1">Status</label>
            <div className="flex gap-2">
              {(['oczekujace', 'rozpoznane'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    status === s
                      ? s === 'rozpoznane'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-htg-sage text-white border-htg-sage'
                      : 'border-htg-card-border text-htg-fg-muted hover:border-htg-sage/40'
                  }`}
                >
                  {s === 'rozpoznane' ? 'Rozpoznane' : 'Oczekujące'}
                </button>
              ))}
            </div>
          </div>

          {status === 'rozpoznane' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-htg-fg-muted uppercase tracking-wider block">
                Fragment odpowiedzi (Moment)
              </label>

              {/* Catalog / All toggle + session filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-htg-card-border overflow-hidden text-xs">
                  <button
                    onClick={() => { setCatalogOnly(true); setSessionFilter(''); }}
                    className={`px-2.5 py-1.5 transition-colors ${catalogOnly ? 'bg-emerald-600 text-white' : 'text-htg-fg-muted hover:bg-htg-surface'}`}
                  >
                    ✅ Katalog Pytań
                  </button>
                  <button
                    onClick={() => setCatalogOnly(false)}
                    className={`px-2.5 py-1.5 transition-colors ${!catalogOnly ? 'bg-htg-sage text-white' : 'text-htg-fg-muted hover:bg-htg-surface'}`}
                  >
                    Wszystkie fragmenty
                  </button>
                </div>

                {/* Session filter */}
                <select
                  value={sessionFilter}
                  onChange={e => setSessionFilter(e.target.value)}
                  className="flex-1 min-w-36 bg-htg-surface border border-htg-card-border rounded-lg px-2 py-1.5 text-xs text-htg-fg focus:outline-none focus:border-htg-sage"
                >
                  <option value="">Wszystkie sesje</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Fragment select */}
              {catalogOnly && displayFragments.length === 0 ? (
                <p className="text-xs text-amber-600 italic">
                  Brak fragmentów w katalogu Pytań. Przełącz na &bdquo;Wszystkie fragmenty&rdquo;.
                </p>
              ) : (
                <select
                  value={fragmentId}
                  onChange={e => setFragmentId(e.target.value)}
                  className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg focus:outline-none focus:border-htg-sage"
                >
                  <option value="">— brak wybranego fragmentu —</option>
                  {displayFragments.map(f => {
                    const label = sessionFilter
                      ? `${f.title} (${fmtTime(f.start_sec)}–${fmtTime(f.end_sec)})`
                      : `${sessionLabel(f)} / ${f.title} (${fmtTime(f.start_sec)}–${fmtTime(f.end_sec)})`;
                    return (
                      <option key={f.id} value={f.id}>
                        {f.is_pytania ? '✅ ' : ''}{label}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminQuestionManager({ items, fragmentOptions }: Props) {
  const [filter, setFilter] = useState<'all' | 'oczekujace' | 'rozpoznane'>('all');
  const [search, setSearch] = useState('');

  const filtered = items.filter(q => {
    if (filter !== 'all' && q.status !== filter) return false;
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted/60" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj pytania…"
            className="w-full pl-9 pr-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:border-htg-sage"
          />
        </div>
        <div className="flex rounded-lg border border-htg-card-border overflow-hidden text-sm">
          {([['all', 'Wszystkie'], ['oczekujace', 'Oczekujące'], ['rozpoznane', 'Rozpoznane']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-2 transition-colors ${filter === val ? 'bg-htg-sage text-white' : 'text-htg-fg-muted hover:bg-htg-surface'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-12 text-htg-fg-muted">Brak pytań</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => (
            <QuestionRow key={q.id} question={q} fragmentOptions={fragmentOptions} />
          ))}
        </div>
      )}
    </div>
  );
}
