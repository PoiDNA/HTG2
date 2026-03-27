'use client';

import { useState, useEffect } from 'react';
import { AArrowUp } from 'lucide-react';

const LEVELS = [100, 120, 140, 160]; // % of base font size
const LABELS = ['A', 'A+', 'A++', 'A+++'];

export default function FontSizeToggle() {
  const [level, setLevel] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('htg-font-level');
    if (saved) {
      const idx = parseInt(saved);
      if (idx >= 0 && idx < LEVELS.length) {
        setLevel(idx);
        applyFontSize(idx);
      }
    }
  }, []);

  function applyFontSize(idx: number) {
    document.documentElement.style.fontSize = `${LEVELS[idx]}%`;
  }

  function toggle() {
    const next = (level + 1) % LEVELS.length;
    setLevel(next);
    applyFontSize(next);
    localStorage.setItem('htg-font-level', String(next));
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
