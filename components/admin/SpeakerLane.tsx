'use client';

import { useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { speakerColor, speakerBaseKey, type SpeakerSegment, type SpeakerSummary } from '@/lib/speakers/client';

/**
 * Lane widoczności mówców — jeden poziomy pasek pod wavesurferem.
 * Szerokość 100% parenta, segmenty pozycjonowane jako % względem durationSec.
 * Klik w segment = seek. Pencil w legendzie = rename mówcy (preset dropdown + custom).
 */

const SPEAKER_PRESETS = ['Natalia', 'Operator', 'Agata', 'Justyna', 'Uczestnik'] as const;
type SpeakerPreset = typeof SPEAKER_PRESETS[number];

const CUSTOM_VALUE = '__custom__';
const CLEAR_VALUE = '__clear__';

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
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (durationSec <= 0 || segments.length === 0) return null;

  const playheadPct = Math.max(0, Math.min(100, (currentSec / durationSec) * 100));

  const startEdit = (base: string, current: string | null) => {
    setEditingKey(base);
    const isPreset = current !== null && (SPEAKER_PRESETS as readonly string[]).includes(current);
    if (current && !isPreset) {
      setMode('custom');
      setDraft(current);
    } else {
      setMode('preset');
      setDraft(current ?? '');
    }
  };

  const cancel = () => {
    setEditingKey(null);
    setMode('preset');
    setDraft('');
  };

  const commit = async (value: string | null) => {
    if (!editingKey || !onRenameSpeaker) { cancel(); return; }
    setSaving(true);
    try {
      await onRenameSpeaker(editingKey, value);
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const commitCustom = () => {
    const trimmed = draft.trim();
    commit(trimmed === '' ? null : trimmed);
  };

  const handleSelectChange = (value: string) => {
    if (value === CUSTOM_VALUE) {
      setMode('custom');
      // keep existing draft if any
      return;
    }
    if (value === CLEAR_VALUE) {
      commit(null);
      return;
    }
    // preset value
    commit(value);
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
          const currentIsPreset =
            s.displayName !== null &&
            s.displayName !== undefined &&
            (SPEAKER_PRESETS as readonly string[]).includes(s.displayName);
          const selectValue =
            mode === 'custom'
              ? CUSTOM_VALUE
              : currentIsPreset
                ? (s.displayName as SpeakerPreset)
                : '';
          return (
            <span key={base} className="flex items-center gap-1.5 text-[11px]">
              <span className={`inline-block w-3 h-3 rounded-sm ${c.bar}`} aria-hidden />
              {isEditing ? (
                <>
                  <select
                    autoFocus
                    value={selectValue}
                    onChange={(e) => handleSelectChange(e.target.value)}
                    disabled={saving}
                    className="px-1.5 py-0.5 text-[11px] bg-htg-surface border border-htg-sage/60 rounded text-htg-fg focus:outline-none"
                  >
                    <option value="" disabled>— wybierz —</option>
                    {SPEAKER_PRESETS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value={CUSTOM_VALUE}>— inne —</option>
                    <option value={CLEAR_VALUE}>(wyczyść)</option>
                  </select>
                  {mode === 'custom' && (
                    <>
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitCustom();
                          else if (e.key === 'Escape') cancel();
                        }}
                        placeholder={base}
                        disabled={saving}
                        className="w-28 px-1.5 py-0.5 text-[11px] bg-htg-surface border border-htg-sage/60 rounded text-htg-fg focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={commitCustom}
                        disabled={saving}
                        className="text-[10px] text-htg-sage hover:underline"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Zapisz'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={saving}
                    className="text-[10px] text-htg-fg-muted hover:text-htg-fg"
                  >
                    Anuluj
                  </button>
                  {saving && mode !== 'custom' && (
                    <Loader2 className="w-3 h-3 animate-spin text-htg-sage" />
                  )}
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
