'use client';

import { useState, useCallback } from 'react';
import {
  Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle, GripVertical,
} from 'lucide-react';

interface Fragment {
  id?: string;
  ordinal: number;
  start_sec: number;
  end_sec: number;
  title: string;
  title_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
}

interface Props {
  sessionId: string;
  initialFragments: Fragment[];
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function parseSec(str: string): number | null {
  // Accept mm:ss.s or ss.s or plain seconds
  const parts = str.split(':');
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const v = parseFloat(str);
  return isNaN(v) ? null : v;
}

export default function FragmentEditorClient({ sessionId, initialFragments }: Props) {
  const [fragments, setFragments] = useState<Fragment[]>(
    [...initialFragments].sort((a, b) => a.ordinal - b.ordinal)
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const updateFragment = useCallback((idx: number, patch: Partial<Fragment>) => {
    setFragments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setStatus(null);
  }, []);

  const addFragment = () => {
    const maxOrdinal = fragments.reduce((m, f) => Math.max(m, f.ordinal), 0);
    const lastEnd = fragments.reduce((m, f) => Math.max(m, f.end_sec), 0);
    setFragments(prev => [
      ...prev,
      {
        ordinal: maxOrdinal + 1,
        start_sec: lastEnd,
        end_sec: lastEnd + 60,
        title: '',
      },
    ]);
    setStatus(null);
  };

  const removeFragment = (idx: number) => {
    const frag = fragments[idx];
    if (frag.id) {
      setDeletedIds(prev => new Set([...prev, frag.id!]));
    }
    setFragments(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // Resequence ordinals
      return next.map((f, i) => ({ ...f, ordinal: i + 1 }));
    });
    setStatus(null);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setFragments(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((f, i) => ({ ...f, ordinal: i + 1 }));
    });
    setStatus(null);
  };

  const moveDown = (idx: number) => {
    if (idx === fragments.length - 1) return;
    setFragments(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((f, i) => ({ ...f, ordinal: i + 1 }));
    });
    setStatus(null);
  };

  const handleSave = async () => {
    // Basic validation
    for (let i = 0; i < fragments.length; i++) {
      const f = fragments[i];
      if (!f.title.trim()) {
        setStatus({ kind: 'error', msg: `Moment ${i + 1}: brak tytułu` });
        return;
      }
      if (f.end_sec <= f.start_sec) {
        setStatus({ kind: 'error', msg: `Moment ${i + 1}: end_sec musi być większe niż start_sec` });
        return;
      }
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fragments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? `HTTP ${res.status}` });
        return;
      }
      // Merge returned IDs back into state
      if (Array.isArray(data.fragments)) {
        setFragments(
          (data.fragments as Fragment[]).sort((a, b) => a.ordinal - b.ordinal)
        );
      }
      setDeletedIds(new Set());
      setStatus({ kind: 'success', msg: `Zapisano ${fragments.length} Momentów` });
    } catch (err) {
      setStatus({ kind: 'error', msg: 'Błąd połączenia' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {status && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
          status.kind === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-500'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {status.kind === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {status.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-htg-fg-muted">
          {fragments.length} {fragments.length === 1 ? 'Moment' : fragments.length >= 2 && fragments.length <= 4 ? 'Momenty' : 'Momentów'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={addFragment}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Dodaj Moment
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-htg-sage hover:bg-htg-sage/90 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Zapisywanie…' : 'Zapisz wszystko'}
          </button>
        </div>
      </div>

      {/* Fragment rows */}
      {fragments.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl px-6 py-12 text-center">
          <p className="text-htg-fg-muted text-sm">Brak Momentów — dodaj pierwszy klikając powyżej</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fragments.map((frag, idx) => (
            <FragmentRow
              key={frag.id ?? `new-${idx}`}
              frag={frag}
              idx={idx}
              total={fragments.length}
              onUpdate={(patch) => updateFragment(idx, patch)}
              onMoveUp={() => moveUp(idx)}
              onMoveDown={() => moveDown(idx)}
              onRemove={() => removeFragment(idx)}
            />
          ))}
        </div>
      )}

      {/* Save button (bottom) */}
      {fragments.length > 3 && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-htg-sage hover:bg-htg-sage/90 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Zapisywanie…' : 'Zapisz wszystko'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────────

interface RowProps {
  frag: Fragment;
  idx: number;
  total: number;
  onUpdate: (patch: Partial<Fragment>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function FragmentRow({ frag, idx, total, onUpdate, onMoveUp, onMoveDown, onRemove }: RowProps) {
  const [startRaw, setStartRaw] = useState(fmtSec(frag.start_sec));
  const [endRaw, setEndRaw] = useState(fmtSec(frag.end_sec));

  const commitStart = () => {
    const v = parseSec(startRaw);
    if (v !== null && v >= 0) {
      onUpdate({ start_sec: v });
      setStartRaw(fmtSec(v));
    } else {
      setStartRaw(fmtSec(frag.start_sec));
    }
  };

  const commitEnd = () => {
    const v = parseSec(endRaw);
    if (v !== null && v > 0) {
      onUpdate({ end_sec: v });
      setEndRaw(fmtSec(v));
    } else {
      setEndRaw(fmtSec(frag.end_sec));
    }
  };

  const duration = frag.end_sec - frag.start_sec;
  const isNew = !frag.id;

  return (
    <div className={`bg-htg-card border rounded-xl p-4 ${isNew ? 'border-htg-sage/40' : 'border-htg-card-border'}`}>
      <div className="flex items-start gap-3">
        {/* Ordinal + reorder */}
        <div className="flex flex-col items-center gap-0.5 pt-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={idx === 0}
            className="w-5 h-5 flex items-center justify-center text-htg-fg-muted hover:text-htg-fg disabled:opacity-20 transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-bold text-htg-fg-muted w-5 text-center">{frag.ordinal}</span>
          <button
            onClick={onMoveDown}
            disabled={idx === total - 1}
            className="w-5 h-5 flex items-center justify-center text-htg-fg-muted hover:text-htg-fg disabled:opacity-20 transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-start">
          {/* Title */}
          <div>
            <label className="text-xs text-htg-fg-muted mb-1 block">Tytuł Momentu</label>
            <input
              type="text"
              value={frag.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="np. Wstęp – oddychanie"
              className="w-full px-3 py-1.5 text-sm bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/40 focus:outline-none focus:border-htg-sage"
            />
          </div>

          {/* Start */}
          <div className="sm:w-28">
            <label className="text-xs text-htg-fg-muted mb-1 block">Start (m:ss)</label>
            <input
              type="text"
              value={startRaw}
              onChange={(e) => setStartRaw(e.target.value)}
              onBlur={commitStart}
              className="w-full px-3 py-1.5 text-sm bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg font-mono focus:outline-none focus:border-htg-sage"
            />
          </div>

          {/* End */}
          <div className="sm:w-28">
            <label className="text-xs text-htg-fg-muted mb-1 block">Koniec (m:ss)</label>
            <input
              type="text"
              value={endRaw}
              onChange={(e) => setEndRaw(e.target.value)}
              onBlur={commitEnd}
              className={`w-full px-3 py-1.5 text-sm bg-htg-surface border rounded-lg text-htg-fg font-mono focus:outline-none focus:border-htg-sage ${
                frag.end_sec <= frag.start_sec
                  ? 'border-red-500/50 text-red-400'
                  : 'border-htg-card-border'
              }`}
            />
          </div>

          {/* Duration badge */}
          <div className="sm:pt-5">
            <span className={`text-xs font-mono px-2 py-1 rounded-full ${
              duration > 0
                ? 'bg-htg-surface text-htg-fg-muted'
                : 'bg-red-500/10 text-red-400'
            }`}>
              {duration > 0 ? fmtSec(duration) : '!'}
            </span>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onRemove}
          className="p-1.5 text-htg-fg-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 shrink-0"
          title="Usuń Moment"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* New badge */}
      {isNew && (
        <p className="text-xs text-htg-sage mt-2 ml-8">Nowy — zostanie zapisany po kliknięciu &quot;Zapisz wszystko&quot;</p>
      )}
    </div>
  );
}
