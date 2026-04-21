'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Loader2, Check, X, UserCog } from 'lucide-react';
import {
  speakerColor,
  speakerBaseKey,
  type SpeakerSegment,
  type SpeakerSummary,
} from '@/lib/speakers/client';

/**
 * Lista segmentów transkrypcji z podświetleniem aktywnego (po currentSec)
 * i klik → seek. Auto-scroll aktywnego do widoku. Inline edycja tekstu
 * segmentu dla stafu (pencil → textarea → PATCH). Opcjonalnie: przepinanie
 * segmentu do innego mówcy (ikona UserCog → popover z listą mówców).
 */

interface Props {
  segments: SpeakerSegment[];
  currentSec: number;
  onSeek: (sec: number) => void;
  /** Edycja tekstu segmentu. Gdy undefined — tryb read-only. */
  onEditSegment?: (segmentId: string, text: string | null) => Promise<void>;
  /** Przepięcie segmentu do innego mówcy. Gdy undefined — UI ukryte. */
  onReassignSpeaker?: (segmentId: string, speakerKey: string) => Promise<void>;
  /** Lista mówców dla popovera reassign (agregat z GET /speakers). */
  speakers?: SpeakerSummary[];
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function TranscriptSegmentList({
  segments,
  currentSec,
  onSeek,
  onEditSegment,
  onReassignSpeaker,
  speakers,
}: Props) {
  const activeIdx = segments.findIndex(
    (s) => s.startSec <= currentSec && s.endSec > currentSec,
  );
  const listRef = useRef<HTMLOListElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);

  // Deduplikuj listę mówców po baseKey (c0_A i c1_A → jedna pozycja "A").
  // Zostawiamy pierwszy (z display_name/role) — wybór do PATCH używa
  // oryginalnego speakerKey pierwszego wariantu; to wystarcza bo segment
  // jest przepinany tylko na ten sam baseKey w innych segmentach istnieje.
  const dedupedSpeakers = useMemo(() => {
    if (!speakers) return [];
    const byBase = new Map<string, SpeakerSummary>();
    for (const s of speakers) {
      const base = speakerBaseKey(s.speakerKey);
      const existing = byBase.get(base);
      if (!existing) {
        byBase.set(base, s);
      } else {
        // Preferuj rekord z displayName/role (bogatsze metadane).
        const score = (x: SpeakerSummary) => (x.displayName ? 2 : 0) + (x.role ? 1 : 0);
        if (score(s) > score(existing)) byBase.set(base, s);
      }
    }
    return Array.from(byBase.values()).sort((a, b) =>
      speakerBaseKey(a.speakerKey).localeCompare(speakerBaseKey(b.speakerKey)),
    );
  }, [speakers]);

  useEffect(() => {
    if (editingId) return; // nie scrolluj gdy user edytuje
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-seg-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx, editingId]);

  // Zamykaj popover reassign na Escape.
  useEffect(() => {
    if (!reassignId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReassignId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reassignId]);

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

  const doReassign = async (segmentId: string, currentKey: string, nextKey: string) => {
    if (!onReassignSpeaker) return;
    if (speakerBaseKey(currentKey) === speakerBaseKey(nextKey)) {
      setReassignId(null);
      return;
    }
    setReassigning(true);
    try {
      await onReassignSpeaker(segmentId, nextKey);
      setReassignId(null);
    } finally {
      setReassigning(false);
    }
  };

  return (
    <ol ref={listRef} className="space-y-1 max-h-96 overflow-y-auto pr-1">
      {segments.map((s, i) => {
        const c = speakerColor(s.role, s.speakerKey);
        const isActive = i === activeIdx;
        const isEditing = editingId === s.id;
        const isReassigning = reassignId === s.id;
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
                {onReassignSpeaker && dedupedSpeakers.length > 1 && !isEditing && (
                  <div className="relative ml-auto shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReassignId(isReassigning ? null : s.id);
                      }}
                      title="Zmień mówcę"
                      className={`transition-colors ${
                        isReassigning ? 'text-htg-sage' : 'text-htg-fg-muted/50 hover:text-htg-sage'
                      }`}
                    >
                      <UserCog className="w-3 h-3" />
                    </button>
                    {isReassigning && (
                      <div
                        className="absolute right-0 top-4 z-20 min-w-[180px] bg-htg-card border border-htg-card-border rounded-md shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-htg-fg-muted">
                          Przepnij do mówcy
                        </div>
                        {dedupedSpeakers.map((sp) => {
                          const spColor = speakerColor(sp.role, sp.speakerKey);
                          const isCurrent =
                            speakerBaseKey(sp.speakerKey) === speakerBaseKey(s.speakerKey);
                          return (
                            <button
                              key={sp.speakerKey}
                              type="button"
                              disabled={reassigning}
                              onClick={() => {
                                if (isCurrent) {
                                  setReassignId(null);
                                  return;
                                }
                                void doReassign(s.id, s.speakerKey, sp.speakerKey);
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] transition-colors ${
                                isCurrent
                                  ? 'bg-htg-sage/10 ring-1 ring-inset ring-htg-sage/40 font-semibold'
                                  : 'hover:bg-htg-card-border/50'
                              } disabled:opacity-50`}
                            >
                              <span
                                className={`inline-block w-2 h-2 rounded-sm ${spColor.bar}`}
                                aria-hidden
                              />
                              <span className="truncate flex-1">
                                {sp.displayName ?? speakerBaseKey(sp.speakerKey)}
                              </span>
                              {sp.role && sp.role !== 'unknown' && (
                                <span className="text-[10px] text-htg-fg-muted shrink-0">
                                  {sp.role}
                                </span>
                              )}
                              {isCurrent && (
                                <Check className="w-3 h-3 text-htg-sage shrink-0" />
                              )}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setReassignId(null)}
                          className="w-full flex items-center gap-1 px-2 py-1 text-left text-[10px] text-htg-fg-muted hover:bg-htg-card-border/50"
                        >
                          <X className="w-3 h-3" /> Anuluj
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {onEditSegment && !isEditing && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                    title="Popraw tekst"
                    className={`text-htg-fg-muted/50 hover:text-htg-sage transition-colors shrink-0 ${
                      onReassignSpeaker && dedupedSpeakers.length > 1 ? '' : 'ml-auto'
                    }`}
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
