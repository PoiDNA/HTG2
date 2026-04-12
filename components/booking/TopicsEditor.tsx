'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Maximize2, Minimize2, Type } from 'lucide-react';

interface TopicsEditorProps {
  bookingId: string;
  initialTopics: string;
}

/** Parse stored topics — supports JSON array or plain text (backward compat) */
function parseTopics(raw: string): string[] {
  if (!raw || !raw.trim()) return [''];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(String).slice(0, 8);
    }
  } catch {
    // Not JSON — treat as single plain-text topic
  }
  return [raw];
}

/** Serialize topics array to JSON string for storage */
function serializeTopics(items: string[]): string {
  const filtered = items.filter(t => t.trim());
  if (filtered.length === 0) return '';
  if (filtered.length === 1) return filtered[0]; // backward compat: single item = plain text
  return JSON.stringify(filtered);
}

const FONT_SIZES = ['text-sm', 'text-base', 'text-lg', 'text-xl'] as const;
const FONT_SIZE_LABELS = ['A', 'A+', 'A++', 'A+++'];

export default function TopicsEditor({ bookingId, initialTopics }: TopicsEditorProps) {
  const [items, setItems] = useState<string[]>(() => parseTopics(initialTopics));
  const [fontSizeIdx, setFontSizeIdx] = useState(1); // default: text-base
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState(initialTopics);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const fontSize = FONT_SIZES[fontSizeIdx];

  // Auto-save with debounce
  const save = useCallback(async (newItems: string[]) => {
    const serialized = serializeTopics(newItems);
    if (serialized === lastSaved) return;

    setSaving(true);
    try {
      await fetch('/api/booking/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, topics: serialized }),
      });
      setLastSaved(serialized);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [bookingId, lastSaved]);

  const scheduleAutoSave = useCallback((newItems: string[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(newItems), 1500);
  }, [save]);

  // Cleanup debounce on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ESC closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    setSaved(false);
    scheduleAutoSave(newItems);
  };

  const addItem = () => {
    if (items.length >= 8) return;
    const newItems = [...items, ''];
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    setSaved(false);
    scheduleAutoSave(newItems);
  };

  const increaseFontSize = () => {
    setFontSizeIdx(prev => Math.min(prev + 1, FONT_SIZES.length - 1));
  };

  const decreaseFontSize = () => {
    setFontSizeIdx(prev => Math.max(prev - 1, 0));
  };

  const content = (
    <div className={`space-y-3 ${isFullscreen ? 'max-w-2xl mx-auto' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-htg-fg-muted">
          Zagadnienia na sesję
        </span>
        <div className="flex items-center gap-1.5">
          {/* Font size controls */}
          <button
            onClick={decreaseFontSize}
            disabled={fontSizeIdx === 0}
            className="p-1.5 rounded-md bg-htg-surface hover:bg-htg-card-border text-htg-fg-muted disabled:opacity-30 transition-colors"
            title="Zmniejsz tekst"
          >
            <Type className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-htg-fg-muted font-medium min-w-[24px] text-center">
            {FONT_SIZE_LABELS[fontSizeIdx]}
          </span>
          <button
            onClick={increaseFontSize}
            disabled={fontSizeIdx === FONT_SIZES.length - 1}
            className="p-1.5 rounded-md bg-htg-surface hover:bg-htg-card-border text-htg-fg-muted disabled:opacity-30 transition-colors"
            title="Powiększ tekst"
          >
            <Type className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-htg-card-border mx-1" />

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md bg-htg-surface hover:bg-htg-card-border text-htg-fg-muted transition-colors"
            title={isFullscreen ? 'Zamknij (ESC)' : 'Pełny ekran'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            {/* Number */}
            <span className={`shrink-0 w-7 h-7 mt-1.5 rounded-full bg-htg-sage/10 text-htg-sage flex items-center justify-center text-xs font-bold`}>
              {index + 1}
            </span>
            {/* Input */}
            <textarea
              value={item}
              onChange={e => updateItem(index, e.target.value)}
              rows={isFullscreen ? 3 : 2}
              maxLength={300}
              placeholder={index === 0 ? 'Opisz temat, nad którym chcesz pracować...' : 'Następny temat...'}
              className={`flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg ${fontSize} resize-none focus:outline-none focus:ring-1 focus:ring-htg-sage/50 placeholder:text-htg-fg-muted/40 transition-all`}
            />
            {/* Remove button */}
            {items.length > 1 && (
              <button
                onClick={() => removeItem(index)}
                className="shrink-0 mt-2 p-1 rounded-md text-htg-fg-muted/40 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Usuń punkt"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add + status row */}
      <div className="flex items-center justify-between">
        {items.length < 8 ? (
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-htg-sage hover:text-htg-sage-dark font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Dodaj punkt ({items.length}/8)
          </button>
        ) : (
          <span className="text-xs text-htg-fg-muted">Maksymalnie 8 punktów</span>
        )}
        <span className="text-xs text-htg-fg-muted">
          {saving ? 'Zapisywanie...' : saved ? '✓ Zapisano' : ''}
        </span>
      </div>
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <>
        <div
          className="fixed inset-0 z-50 bg-htg-bg overflow-auto p-6"
          ref={containerRef}
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-serif font-semibold text-htg-fg">Zagadnienia na sesję</h2>
              <button
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-2 rounded-lg bg-htg-surface text-htg-fg text-sm font-medium hover:bg-htg-card-border transition-colors"
              >
                Zamknij (ESC)
              </button>
            </div>
            {content}
          </div>
        </div>
      </>
    );
  }

  return content;
}
