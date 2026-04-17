'use client';

import { useState, useCallback } from 'react';
import {
  Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

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
  totalDurationSec?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/** Format seconds as "m:ss" label (no decimal) for the ruler. */
function fmtLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// ── FragmentTimeline ───────────────────────────────────────────────────────────

const PX_PER_SEC = 2;
const MINOR_TICK_EVERY = 30;   // seconds
const MAJOR_TICK_EVERY = 300;  // 5 minutes

interface FragmentTimelineProps {
  fragments: Fragment[];
  totalDurationSec: number;
  onClickTime: (sec: number) => void;
  selectedIdx: number | null;
  onSelectFragment: (idx: number) => void;
}

function FragmentTimeline({
  fragments,
  totalDurationSec,
  onClickTime,
  selectedIdx,
  onSelectFragment,
}: FragmentTimelineProps) {
  const totalSec = Math.max(totalDurationSec, 600);
  const totalWidth = totalSec * PX_PER_SEC;

  // Build tick marks
  const ticks: { sec: number; major: boolean }[] = [];
  for (let sec = 0; sec <= totalSec; sec += MINOR_TICK_EVERY) {
    ticks.push({ sec, major: sec % MAJOR_TICK_EVERY === 0 });
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks that land on a fragment bar
    if ((e.target as HTMLElement).dataset.fragBar) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // getBoundingClientRect returns visible area; we need offset within the scroll container
    const scrollLeft = e.currentTarget.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const sec = clickX / PX_PER_SEC;
    onClickTime(Math.max(0, sec));
  };

  return (
    <div
      className="h-24 overflow-x-auto relative bg-htg-surface rounded-xl border border-htg-card-border cursor-crosshair select-none"
      onClick={handleContainerClick}
    >
      {/* Inner ruler — fixed width proportional to duration */}
      <div className="relative h-full" style={{ width: totalWidth }}>

        {/* Tick marks */}
        {ticks.map(({ sec, major }) => {
          const x = sec * PX_PER_SEC;
          return (
            <div key={sec} className="absolute top-0" style={{ left: x }}>
              {/* Vertical line */}
              <div
                className={major ? 'w-px bg-htg-card-border/80' : 'w-px bg-htg-card-border/40'}
                style={{ height: major ? 8 : 4, marginTop: major ? 0 : 2 }}
              />
              {/* Label — only for major ticks, skip 0:00 */}
              {major && sec > 0 && (
                <span
                  className="absolute top-2 text-[9px] leading-none text-htg-fg-muted font-mono"
                  style={{ left: 3, whiteSpace: 'nowrap' }}
                >
                  {fmtLabel(sec)}
                </span>
              )}
            </div>
          );
        })}

        {/* Fragment bars */}
        {fragments.map((frag, idx) => {
          const left = frag.start_sec * PX_PER_SEC;
          const width = Math.max((frag.end_sec - frag.start_sec) * PX_PER_SEC, 4);
          const isSelected = idx === selectedIdx;
          return (
            <div
              key={frag.id ?? `new-${idx}`}
              data-frag-bar="1"
              title={frag.title || `Moment ${frag.ordinal}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFragment(idx);
              }}
              className={[
                'absolute top-8 h-10 rounded cursor-pointer transition-all',
                'bg-htg-sage/70 hover:bg-htg-sage/90',
                isSelected ? 'ring-2 ring-htg-sage ring-offset-1 ring-offset-htg-surface' : '',
              ].join(' ')}
              style={{ left, width }}
            >
              {/* Title label — only shown if bar is wide enough */}
              {width > 40 && (
                <span className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                  <span className="text-[10px] leading-tight text-white/90 font-medium truncate">
                    {frag.title || `Moment ${frag.ordinal}`}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FragmentEditorClient ───────────────────────────────────────────────────────

export default function FragmentEditorClient({
  sessionId,
  initialFragments,
  totalDurationSec = 0,
}: Props) {
  const [fragments, setFragments] = useState<Fragment[]>(
    [...initialFragments].sort((a, b) => a.ordinal - b.ordinal)
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const updateFragment = useCallback((idx: number, patch: Partial<Fragment>) => {
    setFragments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setStatus(null);
  }, []);

  const addFragment = (startSec?: number) => {
    const maxOrdinal = fragments.reduce((m, f) => Math.max(m, f.ordinal), 0);
    const lastEnd = fragments.reduce((m, f) => Math.max(m, f.end_sec), 0);
    const start = startSec !== undefined ? startSec : lastEnd;
    setFragments(prev => [
      ...prev,
      {
        ordinal: maxOrdinal + 1,
        start_sec: start,
        end_sec: start + 60,
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
    if (selectedIdx === idx) setSelectedIdx(null);
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

  const handleSelectFragment = (idx: number) => {
    setSelectedIdx(idx);
    // Scroll the corresponding card into view
    document
      .querySelector(`[data-fragment-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleTimelineClick = (sec: number) => {
    addFragment(sec);
  };

  // Compute effective total duration for the timeline
  const maxFragEnd = fragments.reduce((m, f) => Math.max(m, f.end_sec), 0);
  const effectiveDuration = Math.max(totalDurationSec, maxFragEnd, 600);

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
    } catch {
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
            onClick={() => addFragment()}
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

      {/* Visual timeline ruler */}
      <FragmentTimeline
        fragments={fragments}
        totalDurationSec={effectiveDuration}
        onClickTime={handleTimelineClick}
        selectedIdx={selectedIdx}
        onSelectFragment={handleSelectFragment}
      />

      {/* Fragment rows */}
      {fragments.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl px-6 py-12 text-center">
          <p className="text-htg-fg-muted text-sm">Brak Momentów — dodaj pierwszy klikając powyżej lub kliknij na osi czasu</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fragments.map((frag, idx) => (
            <div key={frag.id ?? `new-${idx}`} data-fragment-idx={idx}>
              <FragmentRow
                frag={frag}
                idx={idx}
                total={fragments.length}
                isSelected={idx === selectedIdx}
                onUpdate={(patch) => updateFragment(idx, patch)}
                onMoveUp={() => moveUp(idx)}
                onMoveDown={() => moveDown(idx)}
                onRemove={() => removeFragment(idx)}
                onSelect={() => setSelectedIdx(idx)}
              />
            </div>
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
  isSelected: boolean;
  onUpdate: (patch: Partial<Fragment>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onSelect: () => void;
}

function FragmentRow({
  frag, idx, total, isSelected,
  onUpdate, onMoveUp, onMoveDown, onRemove, onSelect,
}: RowProps) {
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
    <div
      className={[
        'bg-htg-card border rounded-xl p-4 transition-colors cursor-pointer',
        isNew ? 'border-htg-sage/40' : 'border-htg-card-border',
        isSelected ? 'ring-2 ring-htg-sage/50' : '',
      ].join(' ')}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Ordinal + reorder */}
        <div className="flex flex-col items-center gap-0.5 pt-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={idx === 0}
            className="w-5 h-5 flex items-center justify-center text-htg-fg-muted hover:text-htg-fg disabled:opacity-20 transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-bold text-htg-fg-muted w-5 text-center">{frag.ordinal}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
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
              onClick={(e) => e.stopPropagation()}
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
              onClick={(e) => e.stopPropagation()}
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
              onClick={(e) => e.stopPropagation()}
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
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
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
