'use client';

import { useState, useEffect } from 'react';

const LEVELS = [100, 120, 140, 160]; // % of base font size
const LABELS = ['A', 'A+', 'A++', 'A+++'];
const FONT_CHANGE_EVENT = 'htg-font-change';

export default function FontSizeToggle() {
  const [level, setLevel] = useState(1); // default A+

  // Load from localStorage on mount (default to 1 = A+ if no preference saved)
  useEffect(() => {
    const saved = localStorage.getItem('htg-font-level');
    const idx = saved !== null ? parseInt(saved) : 1;
    if (idx >= 0 && idx < LEVELS.length) {
      setLevel(idx);
      applyFontSize(idx);
    } else {
      applyFontSize(1);
    }
  }, []);

  // Sync multiple instances via CustomEvent (storage event doesn't fire in same tab)
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail;
      if (idx >= 0 && idx < LEVELS.length) {
        setLevel(idx);
        applyFontSize(idx);
      }
    };
    window.addEventListener(FONT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FONT_CHANGE_EVENT, handler);
  }, []);

  function applyFontSize(idx: number) {
    document.documentElement.style.fontSize = `${LEVELS[idx]}%`;
  }

  function toggle() {
    const next = (level + 1) % LEVELS.length;
    setLevel(next);
    applyFontSize(next);
    localStorage.setItem('htg-font-level', String(next));
    window.dispatchEvent(new CustomEvent(FONT_CHANGE_EVENT, { detail: next }));
  }

  return (
    <button
      onClick={toggle}
      className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
        level > 0
          ? 'bg-htg-sage/20 text-htg-sage hover:bg-htg-sage/30'
          : 'text-htg-fg-muted hover:bg-htg-surface'
      }`}
      title={`Rozmiar tekstu: ${LEVELS[level]}%`}
      aria-label={`Zmień rozmiar tekstu (obecnie ${LEVELS[level]}%)`}
    >
      <span className="font-bold text-xs">{LABELS[level]}</span>
    </button>
  );
}
