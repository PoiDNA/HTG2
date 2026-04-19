'use client';

import { useEffect, useRef } from 'react';
import { speakerColor, speakerBaseKey, type SpeakerSegment } from '@/lib/speakers/client';

/**
 * Lista segmentów transkrypcji z podświetleniem aktywnego (po currentSec)
 * i klik → seek. Auto-scroll aktywnego do widoku. Shared shape pod przyszły
 * reuse (np. w widoku nagrania-klientów).
 */

interface Props {
  segments: SpeakerSegment[];
  currentSec: number;
  onSeek: (sec: number) => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function TranscriptSegmentList({ segments, currentSec, onSeek }: Props) {
  const activeIdx = segments.findIndex(
    (s) => s.startSec <= currentSec && s.endSec > currentSec,
  );
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-seg-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  if (segments.length === 0) {
    return (
      <p className="text-xs text-htg-fg-muted italic">Brak transkrypcji.</p>
    );
  }

  return (
    <ol ref={listRef} className="space-y-1 max-h-96 overflow-y-auto pr-1">
      {segments.map((s, i) => {
        const c = speakerColor(s.role, s.speakerKey);
        const isActive = i === activeIdx;
        return (
          <li
            key={s.id}
            data-seg-idx={i}
            className={`flex gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
              isActive
                ? 'bg-htg-sage/15 ring-1 ' + c.ring
                : 'hover:bg-htg-card-border/40'
            }`}
            onClick={() => onSeek(s.startSec)}
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
              </div>
              <p className="text-htg-fg-secondary leading-snug">
                {s.text ?? <span className="italic text-htg-fg-muted">(bez tekstu)</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
