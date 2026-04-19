'use client';

import { speakerColor, type SpeakerSegment, type SpeakerSummary } from '@/lib/speakers/client';

/**
 * Lane widoczności mówców — jeden poziomy pasek pod wavesurferem.
 * Szerokość 100% parenta, segmenty pozycjonowane jako % względem durationSec.
 * Klik w segment = seek.
 */

interface Props {
  segments: SpeakerSegment[];
  speakers: SpeakerSummary[];
  durationSec: number;
  currentSec: number;
  onSeek: (sec: number) => void;
}

export default function SpeakerLane({ segments, speakers, durationSec, currentSec, onSeek }: Props) {
  if (durationSec <= 0 || segments.length === 0) return null;

  const playheadPct = Math.max(0, Math.min(100, (currentSec / durationSec) * 100));

  return (
    <div className="space-y-2">
      {/* Legenda */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        {speakers.map((s) => {
          const c = speakerColor(s.role, s.speakerKey);
          return (
            <span key={s.speakerKey} className="flex items-center gap-1.5 text-[11px]">
              <span className={`inline-block w-3 h-3 rounded-sm ${c.bar}`} aria-hidden />
              <span className="truncate max-w-32">{s.displayName ?? s.speakerKey}</span>
              {s.role && <span className="text-htg-fg-muted">({s.role})</span>}
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
