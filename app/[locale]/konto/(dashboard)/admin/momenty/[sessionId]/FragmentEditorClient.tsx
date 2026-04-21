'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle, Zap, Tag, BookOpen, Languages,
  ShieldCheck, Sparkles, X, Check,
} from 'lucide-react';
import { FRAGMENT_TAGS, FRAGMENT_TAG_LABELS, type FragmentTag } from '@/lib/constants/fragment-tags';
import SessionAudioPlayer, { type SessionAudioPlayerHandle } from '@/components/admin/SessionAudioPlayer';
import SpeakersPanel from '@/components/admin/SpeakersPanel';
import { fragmentText, type SpeakerSegment, type SpeakersResponse } from '@/lib/speakers/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Fragment {
  id?: string;
  ordinal: number;
  start_sec: number;
  end_sec: number;
  title: string;
  title_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  /** Admin-curated impulse — appears in 🔥 Impuls for all users */
  is_impulse?: boolean;
  impulse_order?: number | null;
  /** Staff-curated Słowo — appears in 📖 Słowo for all users */
  is_slowo?: boolean;
  tags?: string[];
}

interface Props {
  sessionId: string;
  initialFragments: Fragment[];
  totalDurationSec?: number;
  pageLocale?: string;
}

interface MomentSuggestion {
  id: string;
  startSec: number;
  endSec: number;
  title: string;
  reason: string;
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
          const isImpulse = !!frag.is_impulse;
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
                isImpulse ? 'bg-htg-lavender/70 hover:bg-htg-lavender/90' : 'bg-htg-sage/70 hover:bg-htg-sage/90',
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

// ── Locale helpers ─────────────────────────────────────────────────────────────

type EditLocale = 'pl' | 'en' | 'de' | 'pt';

const EDIT_LOCALES: readonly EditLocale[] = ['pl', 'en', 'de', 'pt'] as const;

const LOCALE_LABEL: Record<EditLocale, string> = {
  pl: 'PL',
  en: 'EN',
  de: 'DE',
  pt: 'PT',
};

// ── FragmentEditorClient ───────────────────────────────────────────────────────

export default function FragmentEditorClient({
  sessionId,
  initialFragments,
  totalDurationSec = 0,
  pageLocale = 'pl',
}: Props) {
  const [fragments, setFragments] = useState<Fragment[]>(
    [...initialFragments].sort((a, b) => a.ordinal - b.ordinal)
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [editLocale, setEditLocale] = useState<EditLocale>('pl');
  const [translating, setTranslating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<MomentSuggestion[]>([]);
  // PL approval gate — pobierane na mount; admin/editor może akceptować/odwołać.
  const [plApprovedAt, setPlApprovedAt] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const playerRef = useRef<SessionAudioPlayerHandle | null>(null);

  // Fetch PL approval status on mount.
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/fragments/sessions/${sessionId}/pl-approve`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!active || !d) return;
        setPlApprovedAt((d.pl_approved_at as string | null) ?? null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [sessionId]);

  const handleApprovePl = async () => {
    setApproving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/pl-approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setPlApprovedAt((data.pl_approved_at as string | null) ?? null);
      setStatus({ kind: 'success', msg: 'Zatwierdzono wersję PL' });
    } catch {
      setStatus({ kind: 'error', msg: 'Błąd połączenia' });
    } finally {
      setApproving(false);
    }
  };

  const handleRevokePlApproval = async () => {
    if (!confirm('Odwołać akceptację wersji PL? Auto-tłumaczenie Claude zostanie zablokowane do czasu ponownego zatwierdzenia.')) return;
    setApproving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/pl-approve`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setPlApprovedAt(null);
      setStatus({ kind: 'success', msg: 'Odwołano akceptację wersji PL' });
    } catch {
      setStatus({ kind: 'error', msg: 'Błąd połączenia' });
    } finally {
      setApproving(false);
    }
  };

  const handleSpeakerSeek = useCallback((sec: number) => {
    playerRef.current?.seekTo(sec);
  }, []);

  const handleSpeakersData = useCallback((data: SpeakersResponse) => {
    setSpeakerSegments(data.segments);
  }, []);

  const selectedIdxRef = useRef<number | null>(null);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  const updateFragment = useCallback((idx: number, patch: Partial<Fragment>) => {
    setFragments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setStatus(null);
  }, []);

  const addFragment = (startSec?: number, endSec?: number, title?: string) => {
    const maxOrdinal = fragments.reduce((m, f) => Math.max(m, f.ordinal), 0);
    const lastEnd = fragments.reduce((m, f) => Math.max(m, f.end_sec), 0);
    const start = startSec !== undefined ? startSec : lastEnd;
    const end = endSec !== undefined && endSec > start ? endSec : start + 60;
    setFragments(prev => [
      ...prev,
      {
        ordinal: maxOrdinal + 1,
        start_sec: start,
        end_sec: end,
        title: title ?? '',
      },
    ]);
    setStatus(null);
  };

  /**
   * Auto-sugestia tytułu Momentu z transkrypcji mówców w zakresie [start, end].
   * Bierze pierwsze ~5-7 słów z pierwszego paragrafu i dodaje wielokropek.
   */
  const suggestTitleFromRange = useCallback((startSec: number, endSec: number): string => {
    const paras = fragmentText(speakerSegments, startSec, endSec);
    if (paras.length === 0) return '';
    const firstText = paras[0].text.trim();
    if (!firstText) return '';
    const words = firstText.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const take = Math.min(words.length, 6);
    const snippet = words.slice(0, take).join(' ');
    // Remove trailing punctuation before adding ellipsis
    const cleaned = snippet.replace(/[,.;:!?—–-]+$/, '');
    return words.length > take ? `${cleaned} …` : cleaned;
  }, [speakerSegments]);

  const handleRangeSelected = useCallback((startSec: number, endSec: number) => {
    const suggested = suggestTitleFromRange(startSec, endSec);
    setFragments(prev => {
      const maxOrdinal = prev.reduce((m, f) => Math.max(m, f.ordinal), 0);
      const newIdx = prev.length;
      // Schedule selection + scroll after commit
      setTimeout(() => {
        setSelectedIdx(newIdx);
        document
          .querySelector(`[data-fragment-idx="${newIdx}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
      return [
        ...prev,
        {
          ordinal: maxOrdinal + 1,
          start_sec: startSec,
          end_sec: endSec,
          title: suggested,
        },
      ];
    });
    setStatus(null);
  }, [suggestTitleFromRange]);

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
    // Seek audio player to fragment start
    const frag = fragments[idx];
    if (frag) playerRef.current?.seekTo(frag.start_sec);
    // Scroll the corresponding card into view
    document
      .querySelector(`[data-fragment-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleTimelineClick = (sec: number) => {
    playerRef.current?.seekTo(sec);
    addFragment(sec);
  };

  // ── Keyboard: S = start here, E = end here ───────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 's' && e.key !== 'S' && e.key !== 'e' && e.key !== 'E') return;
      const el = document.activeElement;
      const inInput = el instanceof HTMLElement && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      );
      if (inInput) return;
      const t = playerRef.current?.getCurrentTime() ?? 0;
      const isStart = e.key === 's' || e.key === 'S';
      e.preventDefault();

      const idx = selectedIdxRef.current;
      if (isStart) {
        if (idx === null) {
          // Start new fragment at current time
          addFragment(t);
          // Select newly added fragment
          setTimeout(() => setSelectedIdx(fragments.length), 0);
        } else {
          updateFragment(idx, { start_sec: Math.max(0, t) });
        }
      } else {
        // End mark
        if (idx === null) return;
        updateFragment(idx, { end_sec: Math.max(t, (fragments[idx]?.start_sec ?? 0) + 0.1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fragments.length]);

  // Compute effective total duration for the timeline
  const maxFragEnd = fragments.reduce((m, f) => Math.max(m, f.end_sec), 0);
  const effectiveDuration = Math.max(totalDurationSec, audioDuration, maxFragEnd, 600);

  const handleTranslate = async () => {
    if (!confirm('Wygenerować tłumaczenia Claude (EN/DE/PT) dla wszystkich Momentów i segmentów transkrypcji? Nadpisze istniejące tłumaczenia.')) return;
    setTranslating(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setStatus({
        kind: 'success',
        msg: `Przetłumaczono ${data.translated?.fragments ?? 0} Momentów i ${data.translated?.segments ?? 0} segmentów (${Math.round((data.elapsedMs ?? 0) / 1000)}s). Przeładuj stronę, aby zobaczyć.`,
      });
      // Pobierz świeże fragmenty żeby widok pokazał zapisane title_i18n
      try {
        const refresh = await fetch(`/api/admin/fragments/sessions/${sessionId}`);
        if (refresh.ok) {
          const rd = await refresh.json();
          if (Array.isArray(rd.fragments)) {
            setFragments((rd.fragments as Fragment[]).sort((a, b) => a.ordinal - b.ordinal));
          }
        }
      } catch {
        /* best-effort refresh */
      }
    } catch {
      setStatus({ kind: 'error', msg: 'Błąd połączenia' });
    } finally {
      setTranslating(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/fragments/sessions/${sessionId}/suggest-moments`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const cands = Array.isArray(data.candidates) ? data.candidates : [];
      const mapped: MomentSuggestion[] = cands.map((c: { startSec: number; endSec: number; title: string; reason: string }, idx: number) => ({
        id: `sug-${idx}`,
        startSec: c.startSec,
        endSec: c.endSec,
        title: c.title,
        reason: c.reason,
      }));
      setSuggestions(mapped);
      setStatus({
        kind: 'success',
        msg: `Claude zaproponował ${mapped.length} kandydatów (${Math.round((data.elapsedMs ?? 0) / 1000)}s)`,
      });
    } catch {
      setStatus({ kind: 'error', msg: 'Błąd połączenia' });
    } finally {
      setSuggesting(false);
    }
  };

  const handleSuggestionAccept = useCallback((id: string) => {
    setSuggestions((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) addFragment(s.startSec, s.endSec, s.title);
      return prev.filter((x) => x.id !== id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuggestionReject = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      if (editLocale !== 'pl') {
        // Tryb tłumaczenia — zapisujemy wyłącznie title_i18n[locale] per fragment
        // przez dedykowany endpoint /i18n (obsługuje też translatora).
        let ok = 0;
        for (const f of fragments) {
          if (!f.id) continue; // nowe Momenty dodajemy tylko w trybie PL
          const titleForLocale = f.title_i18n?.[editLocale];
          const res = await fetch(
            `/api/admin/fragments/sessions/${sessionId}/fragments/${f.id}/i18n`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                locale: editLocale,
                title: titleForLocale ?? null,
              }),
            },
          );
          if (res.ok) ok += 1;
          else {
            const err = await res.json().catch(() => ({}));
            setStatus({ kind: 'error', msg: `Moment ${f.ordinal}: ${err.error ?? 'błąd'}` });
            return;
          }
        }
        setStatus({ kind: 'success', msg: `Zapisano ${ok} tłumaczeń (${editLocale.toUpperCase()})` });
        return;
      }

      // Tryb PL — pełen batch POST (admin/editor).
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
        <div className="flex gap-2 flex-wrap items-center">
          {/* Locale selector */}
          <div
            className="inline-flex items-center rounded-lg border border-htg-card-border overflow-hidden text-[11px]"
            role="tablist"
            aria-label="Tryb edycji locale"
          >
            {EDIT_LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setEditLocale(l)}
                role="tab"
                aria-selected={editLocale === l}
                className={[
                  'px-2.5 py-1 font-semibold transition-colors',
                  editLocale === l
                    ? 'bg-htg-sage/20 text-htg-sage'
                    : 'text-htg-fg-muted hover:text-htg-fg',
                ].join(' ')}
                title={l === 'pl' ? 'Oryginał (PL)' : `Tłumaczenie ${LOCALE_LABEL[l]}`}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>

          {/* PL approval gate — przycisk/badge; strona jest dla admin/editor więc
              rysujemy bezwarunkowo (translator nie dojdzie do tej strony). */}
          {plApprovedAt ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-500 text-[11px] font-medium border border-green-500/30"
              title={`Wersja PL zaakceptowana: ${new Date(plApprovedAt).toLocaleString('pl-PL')}`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              PL zaakceptowane {new Date(plApprovedAt).toLocaleDateString('pl-PL')}
              <button
                type="button"
                onClick={handleRevokePlApproval}
                disabled={approving}
                className="ml-1 text-[10px] underline text-green-500/80 hover:text-green-400 disabled:opacity-50"
                title="Odwołaj akceptację wersji PL"
              >
                Odwołaj
              </button>
            </span>
          ) : (
            <button
              onClick={handleApprovePl}
              disabled={approving}
              title="Zatwierdź wersję PL (Momenty + transkrypcja). Wymagane przed auto-tłumaczeniem Claude."
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-htg-sage/50 text-htg-sage hover:bg-htg-sage/10 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Zatwierdź wersję PL
            </button>
          )}

          <button
            onClick={handleTranslate}
            disabled={translating || !plApprovedAt}
            title={
              !plApprovedAt
                ? 'Najpierw zatwierdź wersję PL'
                : 'Wygeneruj tłumaczenia Claude (EN/DE/PT) dla Momentów i segmentów'
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-htg-lavender/20 hover:bg-htg-lavender/30 text-htg-lavender rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
            {translating ? 'Tłumaczę…' : 'Przetłumacz Claude (EN/DE/PT)'}
          </button>

          {pageLocale === 'pl' && speakerSegments.length > 0 && (
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              title="Zaproponuj Momenty z transkrypcji (Claude)"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-htg-sage/15 hover:bg-htg-sage/25 text-htg-sage rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {suggesting ? 'Analizuję…' : 'Zaproponuj Momenty (Claude)'}
            </button>
          )}

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

      {/* Audio player z falą + blocki mówców pod falą (synced przy zoomie) */}
      <SessionAudioPlayer
        ref={playerRef}
        sessionId={sessionId}
        onDurationReady={setAudioDuration}
        onTimeUpdate={setCurrentSec}
        speakerSegments={speakerSegments}
        onRangeSelected={handleRangeSelected}
        fragments={fragments.map((f, i) => ({
          id: f.id ?? `new-${i}`,
          start_sec: f.start_sec,
          end_sec: f.end_sec,
          tag: f.tags?.[0],
        }))}
        selectedFragmentId={
          selectedIdx !== null
            ? (fragments[selectedIdx]?.id ?? `new-${selectedIdx}`)
            : null
        }
        onFragmentClick={(markerId) => {
          const idx = fragments.findIndex(
            (f, i) => (f.id ?? `new-${i}`) === markerId,
          );
          if (idx >= 0) handleSelectFragment(idx);
        }}
        onRangeEdit={(markerId, s, e) => {
          const idx = fragments.findIndex(
            (f, i) => (f.id ?? `new-${i}`) === markerId,
          );
          if (idx >= 0) updateFragment(idx, { start_sec: s, end_sec: e });
        }}
      />

      {/* Mówcy + transkrypcja */}
      <SpeakersPanel
        sessionId={sessionId}
        durationSec={effectiveDuration}
        currentSec={currentSec}
        onSeek={handleSpeakerSeek}
        onData={handleSpeakersData}
        locale={editLocale}
      />

      {/* Visual timeline ruler */}
      <FragmentTimeline
        fragments={fragments}
        totalDurationSec={effectiveDuration}
        onClickTime={handleTimelineClick}
        selectedIdx={selectedIdx}
        onSelectFragment={handleSelectFragment}
      />

      {/* Claude suggestions list */}
      {suggestions.length > 0 && (
        <div className="bg-htg-sage/5 border border-htg-sage/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-htg-sage" />
            <h3 className="text-sm font-semibold text-htg-sage">
              Propozycje Claude ({suggestions.length})
            </h3>
          </div>
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-3 p-3 bg-htg-surface/60 border border-htg-card-border rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-htg-fg truncate">{s.title}</span>
                  <span className="text-[11px] font-mono text-htg-fg-muted shrink-0">
                    {fmtSec(s.startSec)} – {fmtSec(s.endSec)} ({fmtSec(s.endSec - s.startSec)})
                  </span>
                </div>
                {s.reason && (
                  <p className="text-xs text-htg-fg-secondary mt-1 leading-snug">{s.reason}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSuggestionAccept(s.id)}
                  title="Akceptuj — dodaj jako Moment"
                  className="flex items-center gap-1 px-2.5 py-1 bg-htg-sage hover:bg-htg-sage/90 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Akceptuj
                </button>
                <button
                  type="button"
                  onClick={() => handleSuggestionReject(s.id)}
                  title="Odrzuć"
                  className="flex items-center gap-1 px-2.5 py-1 bg-htg-surface hover:bg-red-500/10 text-htg-fg-muted hover:text-red-400 border border-htg-card-border rounded-lg text-xs font-medium transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Odrzuć
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                speakerSegments={speakerSegments}
                editLocale={editLocale}
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
  speakerSegments: SpeakerSegment[];
  editLocale: EditLocale;
  onUpdate: (patch: Partial<Fragment>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onSelect: () => void;
}

function FragmentRow({
  frag, idx, total, isSelected, speakerSegments, editLocale,
  onUpdate, onMoveUp, onMoveDown, onRemove, onSelect,
}: RowProps) {
  // W trybie tłumaczenia edytujemy title_i18n[locale]; fallback widoku — title PL.
  const localeTitle =
    editLocale === 'pl' ? frag.title : (frag.title_i18n?.[editLocale] ?? '');
  const localeTitleFallback = editLocale !== 'pl' && !frag.title_i18n?.[editLocale];

  const setLocaleTitle = (v: string) => {
    if (editLocale === 'pl') {
      onUpdate({ title: v });
    } else {
      const next = { ...(frag.title_i18n ?? {}) };
      if (v.trim() === '') {
        delete next[editLocale];
      } else {
        next[editLocale] = v;
      }
      onUpdate({ title_i18n: next });
    }
  };
  const [showTranscript, setShowTranscript] = useState(false);
  const transcript = fragmentText(speakerSegments, frag.start_sec, frag.end_sec);
  const hasTranscript = transcript.length > 0;
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
          {/* Title — w trybie locale≠PL pokazujemy side-by-side PL (read-only) + tłumaczenie */}
          {editLocale !== 'pl' ? (
            <div className="grid grid-cols-2 gap-2">
              {/* PL — read-only */}
              <div>
                <label className="text-xs text-htg-fg-muted mb-1 block opacity-70">
                  Tytuł Momentu <span className="uppercase text-[9px] font-bold">PL</span>
                </label>
                <input
                  type="text"
                  value={frag.title}
                  disabled
                  readOnly
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-3 py-1.5 text-sm bg-htg-surface/50 border border-htg-card-border rounded-lg text-htg-fg-muted opacity-70 cursor-not-allowed"
                />
              </div>
              {/* Tłumaczenie — edytowalne */}
              <div>
                <label className="text-xs text-htg-fg-muted mb-1 block flex items-center gap-1.5">
                  Tytuł Momentu
                  <span className="uppercase text-[9px] font-bold text-htg-lavender">
                    {editLocale}
                  </span>
                  {localeTitleFallback && (
                    <span className="text-[9px] text-htg-warm" title={`Brak tłumaczenia ${editLocale.toUpperCase()} — placeholder pokazuje oryginał PL.`}>
                      (brak)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={localeTitle}
                  onChange={(e) => setLocaleTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={`Tłumaczenie ${editLocale.toUpperCase()}`}
                  className="w-full px-3 py-1.5 text-sm bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/40 focus:outline-none focus:border-htg-sage"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-htg-fg-muted mb-1 block">
                Tytuł Momentu
              </label>
              <input
                type="text"
                value={localeTitle}
                onChange={(e) => setLocaleTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="np. Wstęp – oddychanie"
                className="w-full px-3 py-1.5 text-sm bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/40 focus:outline-none focus:border-htg-sage"
              />
            </div>
          )}

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

        {/* Impulse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ is_impulse: !frag.is_impulse });
          }}
          title={frag.is_impulse ? 'Usuń z Impuls' : 'Oznacz jako Impuls 🔥'}
          className={[
            'p-1.5 rounded-lg transition-colors shrink-0',
            frag.is_impulse
              ? 'text-htg-lavender bg-htg-lavender/10 hover:bg-htg-lavender/20'
              : 'text-htg-fg-muted/40 hover:text-htg-lavender hover:bg-htg-lavender/10',
          ].join(' ')}
        >
          <Zap className="w-4 h-4" />
        </button>

        {/* Słowo toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ is_slowo: !frag.is_slowo });
          }}
          title={frag.is_slowo ? 'Usuń ze Słowa' : 'Oznacz jako Słowo 📖'}
          className={[
            'p-1.5 rounded-lg transition-colors shrink-0',
            frag.is_slowo
              ? 'text-htg-warm bg-htg-warm/10 hover:bg-htg-warm/20'
              : 'text-htg-fg-muted/40 hover:text-htg-warm hover:bg-htg-warm/10',
          ].join(' ')}
        >
          <BookOpen className="w-4 h-4" />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 text-htg-fg-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 shrink-0"
          title="Usuń Moment"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Tag chips */}
      <div className="mt-3 ml-8 flex items-center gap-2 flex-wrap">
        <Tag className="w-3.5 h-3.5 text-htg-fg-muted shrink-0" />
        {FRAGMENT_TAGS.map((tag) => {
          const active = (frag.tags ?? []).includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const current = new Set(frag.tags ?? []);
                if (active) current.delete(tag);
                else current.add(tag);
                onUpdate({ tags: Array.from(current) as FragmentTag[] });
              }}
              className={[
                'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                active
                  ? 'bg-htg-sage/20 border-htg-sage/40 text-htg-sage'
                  : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-card-border/80',
              ].join(' ')}
            >
              {FRAGMENT_TAG_LABELS[tag].pl}
            </button>
          );
        })}
      </div>

      {/* Transcript snippet dla Momentu */}
      {hasTranscript && (
        <div className="mt-3 ml-8">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowTranscript((v) => !v); }}
            className="text-[11px] text-htg-fg-muted hover:text-htg-sage transition-colors"
          >
            {showTranscript ? '− Ukryj transkrypcję' : `+ Transkrypcja (${transcript.length} ${transcript.length === 1 ? 'wypowiedź' : 'wypowiedzi'})`}
          </button>
          {showTranscript && (
            <div className="mt-2 space-y-2 text-xs bg-htg-surface/50 border border-htg-card-border rounded-lg p-3">
              {transcript.map((p, i) => (
                <p key={i} className="leading-snug">
                  <span className="font-semibold text-htg-sage">
                    {p.displayName ?? p.speakerKey}:
                  </span>{' '}
                  <span className="text-htg-fg-secondary">{p.text}</span>
                </p>
              ))}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const txt = transcript
                    .map((p) => `${p.displayName ?? p.speakerKey}: ${p.text}`)
                    .join('\n\n');
                  navigator.clipboard?.writeText(txt).catch(() => {});
                }}
                className="text-[10px] text-htg-fg-muted hover:text-htg-sage transition-colors"
              >
                Kopiuj tekst
              </button>
            </div>
          )}
        </div>
      )}

      {/* New / impulse / slowo badges */}
      {(isNew || frag.is_impulse || frag.is_slowo) && (
        <div className="flex flex-wrap gap-2 mt-2 ml-8">
          {isNew && (
            <p className="text-xs text-htg-sage">Nowy — zostanie zapisany po kliknięciu &quot;Zapisz wszystko&quot;</p>
          )}
          {frag.is_impulse && (
            <p className="text-xs text-htg-lavender flex items-center gap-1">
              <Zap className="w-3 h-3" /> Impuls — widoczny w sekcji 🔥 dla wszystkich
            </p>
          )}
          {frag.is_slowo && (
            <p className="text-xs text-htg-warm flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Słowo — widoczny w sekcji 📖 dla wszystkich
            </p>
          )}
        </div>
      )}
    </div>
  );
}
