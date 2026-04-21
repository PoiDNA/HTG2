'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Loader2, Check, X } from 'lucide-react';
import { speakerColor, speakerBaseKey, type SpeakerSegment } from '@/lib/speakers/client';

/**
 * Lista segmentów transkrypcji z podświetleniem aktywnego (po currentSec)
 * i klik → seek. Auto-scroll aktywnego do widoku. Inline edycja tekstu
 * segmentu dla stafu (pencil → textarea → PATCH).
 */

interface Props {
  segments: SpeakerSegment[];
  currentSec: number;
  onSeek: (sec: number) => void;
  /** Edycja tekstu segmentu. Gdy undefined — tryb read-only. */
  onEditSegment?: (segmentId: string, text: string | null) => Promise<void>;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function TranscriptSegmentList({ segments, currentSec, onSeek, onEditSegment }: Props) {
  const activeIdx = segments.findIndex(
    (s) => s.startSec <= currentSec && s.endSec > currentSec,
  );
  const listRef = useRef<HTMLOListElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId) return; // nie scrolluj gdy user edytuje
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-seg-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx, editingId]);

  if (segments.length === 0) {
    return (
      <p className="text-xs text-htg-fg-muted italic">Brak transkrypcji.</p>
    );
  }

  const startEdit = (s: SpeakerSegment) => {
    setEditingId(s.id);
    setDraft(s.text ?? '');
  };

  const commit = async () => {
    if (!editingId || !onEditSegment) { setEditingId(null); return; }
    setSaving(true);
    try {
      await onEditSegment(editingId, draft.trim() === '' ? null : draft);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ol ref={listRef} className="space-y-1 max-h-96 overflow-y-auto pr-1">
      {segments.map((s, i) => {
        const c = speakerColor(s.role, s.speakerKey);
        const isActive = i === activeIdx;
        const isEditing = editingId === s.id;
        return (
          <li
            key={s.id}
            data-seg-idx={i}
            className={`flex gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
              isEditing
                ? 'bg-htg-surface ring-1 ring-htg-sage/50'
                : isActive
                  ? 'bg-htg-sage/15 ring-1 cursor-pointer ' + c.ring
                  : 'hover:bg-htg-card-border/40 cursor-pointer'
            }`}
            onClick={() => { if (!isEditing) onSeek(s.startSec); }}
          >
            <span className={`shrink-0 w-1 rounded-sm ${c.bar}`} aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-semibold truncate">
                  {s.displayName ?? speakerBaseKey(s.speakerKey)}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-htg-fg-muted shrink-0">
                  {fmt(s.startSec)}
                </span>
                {onEditSegment && !isEditing && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                    title="Popraw tekst"
                    className="ml-auto text-htg-fg-muted/50 hover:text-htg-sage transition-colors shrink-0"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingId(null);
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
                    }}
                    disabled={saving}
                    rows={Math.max(2, Math.min(8, Math.ceil(draft.length / 80)))}
                    className="w-full px-2 py-1.5 text-xs bg-htg-card border border-htg-card-border rounded-md text-htg-fg leading-snug resize-y focus:outline-none focus:border-htg-sage"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={commit}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage rounded text-[10px] font-medium"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Zapisz
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-htg-fg-muted hover:text-htg-fg text-[10px]"
                    >
                      <X className="w-3 h-3" /> Anuluj
                    </button>
                    <span className="text-[10px] text-htg-fg-muted ml-auto">⌘/Ctrl+Enter = Zapisz · Esc = Anuluj</span>
                  </div>
                </div>
              ) : (
                <p className="text-htg-fg-secondary leading-snug">
                  {s.text ?? <span className="italic text-htg-fg-muted">(bez tekstu)</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
