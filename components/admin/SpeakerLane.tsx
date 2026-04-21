'use client';

import { useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { speakerColor, speakerBaseKey, type SpeakerSegment, type SpeakerSummary } from '@/lib/speakers/client';

/**
 * Lane widoczności mówców — jeden poziomy pasek pod wavesurferem.
 * Szerokość 100% parenta, segmenty pozycjonowane jako % względem durationSec.
 * Klik w segment = seek. Pencil w legendzie = rename mówcy.
 */

interface Props {
  segments: SpeakerSegment[];
  speakers: SpeakerSummary[];
  durationSec: number;
  currentSec: number;
  onSeek: (sec: number) => void;
  /** Rename mówcy (bulk update po speaker_key w aktywnym imporcie). */
  onRenameSpeaker?: (speakerKey: string, displayName: string | null) => Promise<void>;
}

export default function SpeakerLane({
  segments, speakers, durationSec, currentSec, onSeek, onRenameSpeaker,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (durationSec <= 0 || segments.length === 0) return null;

  const playheadPct = Math.max(0, Math.min(100, (currentSec / durationSec) * 100));

  const startEdit = (base: string, current: string | null) => {
    setEditingKey(base);
    setDraft(current ?? '');
  };

  const commit = async () => {
    if (!editingKey || !onRenameSpeaker) { setEditingKey(null); return; }
    setSaving(true);
    try {
      await onRenameSpeaker(editingKey, draft.trim() === '' ? null : draft.trim());
      setEditingKey(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Legenda — deduplikacja po kluczu bazowym (c0_A i c1_A = ten sam mówca) */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        {Array.from(
          speakers.reduce((map, s) => {
            const base = speakerBaseKey(s.speakerKey);
            if (!map.has(base)) map.set(base, s);
            return map;
          }, new Map<string, SpeakerSummary>()).values()
        ).map((s) => {
          const c = speakerColor(s.role, s.speakerKey);
          const base = speakerBaseKey(s.speakerKey);
          const label = s.displayName ?? base;
          const isEditing = editingKey === base;
          return (
            <span key={base} className="flex items-center gap-1.5 text-[11px]">
              <span className={`inline-block w-3 h-3 rounded-sm ${c.bar}`} aria-hidden />
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      else if (e.key === 'Escape') setEditingKey(null);
                    }}
                    placeholder={base}
                    disabled={saving}
                    className="w-28 px-1.5 py-0.5 text-[11px] bg-htg-surface border border-htg-sage/60 rounded text-htg-fg focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commit}
                    disabled={saving}
                    className="text-[10px] text-htg-sage hover:underline"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Zapisz'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    disabled={saving}
                    className="text-[10px] text-htg-fg-muted hover:text-htg-fg"
                  >
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <span className="truncate max-w-32">{label}</span>
                  {s.role && <span className="text-htg-fg-muted">({s.role})</span>}
                  {onRenameSpeaker && (
                    <button
                      type="button"
                      onClick={() => startEdit(base, s.displayName)}
                      title="Nadaj imię"
                      className="text-htg-fg-muted/60 hover:text-htg-sage transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </span>
          );
        })}
      </div>

      {/* Pasek */}
      <div className="relative h-4 w-full rounded bg-htg-card-border/40 overflow-hidden">
        {segments.map((s) => {
          const leftPct = (s.startSec / durationSec) * 100;
          const widthPct = Math.max(0.15, ((s.endSec - s.startSec) / durationSec) * 100);
          const c = speakerColor(s.role, s.speakerKey);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSeek(s.startSec)}
              title={`${s.displayName ?? s.speakerKey} · ${Math.round(s.endSec - s.startSec)}s`}
              className={`absolute top-0 h-full ${c.bar} hover:brightness-125 transition-all`}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/90 pointer-events-none shadow"
          style={{ left: `${playheadPct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
