'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, BookmarkCheck, X, Star, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { AudioEngineHandle } from '@/components/session-review/AudioEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionFragment {
  id: string;
  ordinal: number;
  start_sec: number;
  end_sec: number;
  title: string;
  title_i18n: Record<string, string>;
  is_impulse: boolean;
}

interface UserCategory {
  id: string;
  name: string;
  color: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSec: number): string {
  const sec = Math.floor(Math.max(0, totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(value: string): number {
  const trimmed = value.trim();
  const parts = trimmed.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// ---------------------------------------------------------------------------
// SaveFragmentModal (via portal, avoids overflow-hidden clipping in player)
// ---------------------------------------------------------------------------

interface ModalProps {
  onClose: () => void;
  sessionTemplateId?: string;
  bookingRecordingId?: string;
  activePredefined: SessionFragment | null;
  currentTime: number;
  duration: number | null;
  onSaved: (saveId: string) => void;
}

function SaveFragmentModal({
  onClose,
  sessionTemplateId,
  bookingRecordingId,
  activePredefined,
  currentTime,
  duration,
  onSaved,
}: ModalProps) {
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [startInput, setStartInput] = useState(formatTime(Math.max(0, currentTime - 30)));
  const [endInput, setEndInput] = useState(formatTime(Math.min(duration ?? currentTime + 30, currentTime + 30)));
  const [customTitle, setCustomTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPredefined, setSavingPredefined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user categories
  useEffect(() => {
    fetch('/api/fragments/categories')
      .then(r => r.json())
      .then(d => { if (d.categories) setCategories(d.categories); })
      .catch(() => {});
  }, []);

  const handleSavePredefined = async () => {
    if (!activePredefined || !sessionTemplateId) return;
    setSavingPredefined(true);
    setError(null);
    try {
      const res = await fetch('/api/fragments/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_template_id: sessionTemplateId,
          fragment_type: 'predefined',
          session_fragment_id: activePredefined.id,
          fallback_start_sec: activePredefined.start_sec,
          fallback_end_sec: activePredefined.end_sec,
          category_id: categoryId || null,
          is_favorite: isFavorite,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd zapisu');
        return;
      }
      onSaved(data.save.id);
      onClose();
    } finally {
      setSavingPredefined(false);
    }
  };

  const handleSaveCustom = async () => {
    const startSec = parseTime(startInput);
    const endSec = parseTime(endInput);
    if (endSec <= startSec) {
      setError('Koniec musi być po początku fragmentu');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fragments/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_template_id: sessionTemplateId ?? null,
          booking_recording_id: bookingRecordingId ?? null,
          fragment_type: 'custom',
          custom_start_sec: startSec,
          custom_end_sec: endSec,
          custom_title: customTitle || null,
          category_id: categoryId || null,
          is_favorite: isFavorite,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === 'You have already saved this fragment'
          ? 'Ten fragment już jest zapisany'
          : data.error || 'Błąd zapisu');
        return;
      }
      onSaved(data.save.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-md bg-[#0D1A12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-htg-sage" />
            Zapisz fragment
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Predefined fragment (Typ A) — shown when cursor is inside a segment */}
          {activePredefined && sessionTemplateId && (
            <div className="bg-htg-sage/10 border border-htg-sage/30 rounded-xl p-4">
              <p className="text-xs text-htg-sage uppercase tracking-wide font-medium mb-1">
                Segment
              </p>
              <p className="text-white font-medium text-sm mb-1">{activePredefined.title}</p>
              <p className="text-white/50 text-xs mb-3">
                {formatTime(activePredefined.start_sec)} – {formatTime(activePredefined.end_sec)}
              </p>
              <button
                onClick={handleSavePredefined}
                disabled={savingPredefined}
                className="w-full py-2 rounded-lg bg-htg-sage text-white text-sm font-medium
                           hover:bg-htg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors flex items-center justify-center gap-2"
              >
                {savingPredefined && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Zapisz ten fragment
              </button>
            </div>
          )}

          {/* Custom range (Typ B) */}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wide font-medium mb-3">
              {activePredefined ? 'Lub zaznacz własny' : 'Własny fragment'}
            </p>

            {/* Time range inputs */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">Od</label>
                <input
                  type="text"
                  value={startInput}
                  onChange={e => setStartInput(e.target.value)}
                  placeholder="0:00"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                             text-white text-sm font-mono focus:outline-none focus:border-htg-sage/60
                             placeholder-white/20 transition-colors"
                />
              </div>
              <div className="text-white/30 pt-5">→</div>
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">Do</label>
                <input
                  type="text"
                  value={endInput}
                  onChange={e => setEndInput(e.target.value)}
                  placeholder="1:00"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                             text-white text-sm font-mono focus:outline-none focus:border-htg-sage/60
                             placeholder-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Custom title */}
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="Nazwa fragmentu (opcjonalnie)"
              maxLength={100}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                         text-white text-sm focus:outline-none focus:border-htg-sage/60
                         placeholder-white/30 transition-colors mb-3"
            />
          </div>

          {/* Category + favorite */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-white/40 block mb-1">Kategoria</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                           text-white text-sm focus:outline-none focus:border-htg-sage/60
                           transition-colors appearance-none"
              >
                <option value="">Brak kategorii</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="shrink-0 pt-5">
              <button
                onClick={() => setIsFavorite(f => !f)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors
                           ${isFavorite
                             ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                             : 'bg-white/5 border-white/10 text-white/30 hover:text-white/60'}`}
                title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              >
                <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Note (collapsible) */}
          <div>
            <button
              onClick={() => setShowNote(n => !n)}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              {showNote ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showNote ? 'Ukryj notatkę' : 'Dodaj notatkę'}
            </button>
            {showNote && (
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Twoja notatka..."
                maxLength={500}
                rows={3}
                className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                           text-white text-sm focus:outline-none focus:border-htg-sage/60
                           placeholder-white/20 resize-none transition-colors"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer — custom save button */}
        <div className="px-5 py-4 border-t border-white/10">
          <button
            onClick={handleSaveCustom}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-htg-sage text-white font-medium text-sm
                       hover:bg-htg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {activePredefined ? 'Zapisz jako własny' : 'Zapisz fragment'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// SaveFragmentButton (main export)
// ---------------------------------------------------------------------------

interface SaveFragmentButtonProps {
  engineHandle: AudioEngineHandle | null;
  /** For VOD library sessions */
  sessionTemplateId?: string;
  /** For personal booking recordings */
  bookingRecordingId?: string;
  className?: string;
}

export default function SaveFragmentButton({
  engineHandle,
  sessionTemplateId,
  bookingRecordingId,
  className = '',
}: SaveFragmentButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fragments, setFragments] = useState<SessionFragment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const hasFetched = useRef(false);

  // Subscribe to audio time/duration
  useEffect(() => {
    if (!engineHandle) return;
    const unsubTime = engineHandle.subscribeToTime(setCurrentTime);
    const unsubDur = engineHandle.subscribeToDuration(setDuration);
    return () => { unsubTime(); unsubDur(); };
  }, [engineHandle]);

  // Fetch predefined fragments for VOD sessions (once)
  useEffect(() => {
    if (!sessionTemplateId || hasFetched.current) return;
    hasFetched.current = true;
    fetch(`/api/fragments/sessions/${sessionTemplateId}`)
      .then(r => r.json())
      .then(d => { if (d.fragments) setFragments(d.fragments); })
      .catch(() => {});
  }, [sessionTemplateId]);

  // Find active predefined fragment at currentTime
  const activePredefined = fragments.find(
    f => !f.is_impulse && currentTime >= f.start_sec && currentTime < f.end_sec,
  ) ?? null;

  // Track whether the button is visible at all (only when audio is ready)
  const isReady = !!engineHandle;

  const handleSaved = useCallback((saveId: string) => {
    setSavedIds(prev => new Set([...prev, saveId]));
  }, []);

  const hasSaved = savedIds.size > 0;

  if (!isReady) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                    text-xs font-medium transition-all
                    ${hasSaved
                      ? 'bg-htg-sage/20 text-htg-sage border border-htg-sage/30'
                      : 'bg-black/30 text-white/70 border border-white/10 hover:bg-black/50 hover:text-white'}
                    ${className}`}
        title="Zapisz fragment"
      >
        {hasSaved
          ? <BookmarkCheck className="w-3.5 h-3.5" />
          : <Bookmark className="w-3.5 h-3.5" />}
        {activePredefined
          ? <span className="hidden sm:inline">{activePredefined.title}</span>
          : <span className="hidden sm:inline">Zapisz fragment</span>}
      </button>

      {isOpen && (
        <SaveFragmentModal
          onClose={() => setIsOpen(false)}
          sessionTemplateId={sessionTemplateId}
          bookingRecordingId={bookingRecordingId}
          activePredefined={activePredefined}
          currentTime={currentTime}
          duration={duration}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
