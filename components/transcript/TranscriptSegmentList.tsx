'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Loader2, Check, X } from 'lucide-react';
import { speakerColor, speakerBaseKey, type SpeakerSegment } from '@/lib/speakers/client';

/**
 * Lista segmentów transkrypcji z podświetleniem aktywnego (po currentSec)
 * i klik → seek. Auto-scroll aktywnego do widoku. Inline edycja tekstu
 * segmentu dla stafu (pencil → textarea → PATCH).
 *
 * Tryb locale:
 *   - locale='pl' (domyślnie) — wyświetla i edytuje `text` (oryginał).
 *   - locale='en'|'de'|'pt'  — wyświetla `textI18n[locale]` (fallback: `text`
 *     wyszarzony, oznaczony jako PL) i zapisuje przez PATCH z parametrem
 *     `locale`.
 */

type EditLocale = 'pl' | 'en' | 'de' | 'pt';

interface Props {
  segments: SpeakerSegment[];
  currentSec: number;
  onSeek: (sec: number) => void;
  /**
   * Edycja tekstu segmentu. Gdy undefined — tryb read-only.
   * Drugi argument: locale — dla 'pl' edycja oryginału, dla innych edycja
   * text_i18n[locale].
   */
  onEditSegment?: (segmentId: string, text: string | null, locale: EditLocale) => Promise<void>;
  /** Bieżący locale edycji. Domyślnie 'pl'. */
  locale?: EditLocale;
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
  locale = 'pl',
}: Props) {
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

  /** Dla danego segmentu zwróć tekst aktualnie wyświetlany w trybie `locale`. */
  const displayText = (s: SpeakerSegment): { text: string | null; fallback: boolean } => {
    if (locale === 'pl') return { text: s.text, fallback: false };
    const tr = s.textI18n?.[locale];
    if (tr && tr.trim() !== '') return { text: tr, fallback: false };
    return { text: s.text, fallback: true };
  };

  const startEdit = (s: SpeakerSegment) => {
    setEditingId(s.id);
    const { text } = displayText(s);
    // Dla tłumaczenia zacznij od pustego tekstu jeśli nie ma tłumaczenia (fallback)
    const initial = locale === 'pl' ? (s.text ?? '') : (s.textI18n?.[locale] ?? '');
    setDraft(initial !== '' ? initial : (text ?? ''));
  };

  const commit = async () => {
    if (!editingId || !onEditSegment) { setEditingId(null); return; }
    setSaving(true);
    try {
      await onEditSegment(editingId, draft.trim() === '' ? null : draft, locale);
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
        const { text: shown, fallback } = displayText(s);
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
                {locale !== 'pl' && fallback && (
                  <span
                    className="text-[9px] uppercase tracking-wide text-htg-warm shrink-0"
                    title="Brak tłumaczenia — pokazany oryginał (PL)"
                  >
                    PL
                  </span>
                )}
                {onEditSegment && !isEditing && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                    title={locale === 'pl' ? 'Popraw tekst (PL)' : `Edytuj tłumaczenie (${locale.toUpperCase()})`}
                    className="ml-auto text-htg-fg-muted/50 hover:text-htg-sage transition-colors shrink-0"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {/* W trybie locale≠PL pokazujemy oryginał PL obok pola edycji (read-only) */}
                  {locale !== 'pl' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wide text-htg-fg-muted opacity-70 mb-0.5">PL</div>
                        <p className="text-xs leading-snug text-htg-fg-muted/80 bg-htg-surface/40 border border-htg-card-border rounded-md px-2 py-1.5">
                          {s.text ?? <span className="italic">(bez tekstu)</span>}
                        </p>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wide text-htg-lavender mb-0.5">{locale.toUpperCase()}</div>
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
                      </div>
                    </div>
                  )}
                  {locale === 'pl' && (
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
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={commit}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage rounded text-[10px] font-medium"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Zapisz {locale !== 'pl' && <span className="uppercase">({locale})</span>}
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
              ) : locale !== 'pl' ? (
                /* Widok niebędący trybem edycji — side-by-side PL (read-only) | tłumaczenie */
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-htg-fg-muted opacity-70 mb-0.5">PL</div>
                    <p className="leading-snug text-htg-fg-muted/80">
                      {s.text ?? <span className="italic text-htg-fg-muted">(bez tekstu)</span>}
                    </p>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-htg-lavender mb-0.5">{locale.toUpperCase()}</div>
                    <p className={`leading-snug ${fallback ? 'text-htg-fg-muted italic' : 'text-htg-fg-secondary'}`}>
                      {fallback
                        ? <span className="italic text-htg-fg-muted">(brak tłumaczenia)</span>
                        : (shown ?? <span className="italic text-htg-fg-muted">(bez tekstu)</span>)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="leading-snug text-htg-fg-secondary">
                  {shown ?? <span className="italic text-htg-fg-muted">(bez tekstu)</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
