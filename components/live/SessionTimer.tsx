'use client';

import { useEffect, useState } from 'react';
import type { Phase } from '@/lib/live/types';

const PHASE_LABELS: Partial<Record<Phase, string>> = {
  wstep: 'Faza 1',
  sesja: 'Faza 2',
  podsumowanie: 'Faza 3',
};

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

interface Props {
  /** Timestamp when session started (wstep began). Null until session starts. */
  startedAt: string | null;
  /** Timestamp when current phase began. */
  phaseChangedAt: string;
  /** Current phase. Timer only renders for wstep / sesja / podsumowanie. */
  phase: Phase;
}

/**
 * Staff-only session timer showing:
 *  - Large total elapsed time from session start
 *  - Smaller current phase elapsed time with phase label (Faza 1/2/3)
 *
 * Updates every second. Invisible to clients (caller must guard isStaff).
 */
export function SessionTimer({ startedAt, phaseChangedAt, phase }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const phaseLabel = PHASE_LABELS[phase];
  if (!phaseLabel) return null;  // hide during transitions, poczekalnia, outro

  const totalSeconds = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;

  const phaseSeconds = Math.max(0, Math.floor((now - new Date(phaseChangedAt).getTime()) / 1000));

  return (
    <div className="flex flex-col items-end gap-0.5 select-none pointer-events-none">
      {/* Big total timer */}
      <div className="text-white font-mono text-xl font-bold leading-none tracking-widest tabular-nums">
        {formatDuration(totalSeconds)}
      </div>
      {/* Phase timer */}
      <div className="flex items-center gap-1.5">
        <span className="text-white/40 text-[10px] font-medium uppercase tracking-wider">{phaseLabel}</span>
        <span className="text-white/60 font-mono text-xs tabular-nums">{formatDuration(phaseSeconds)}</span>
      </div>
    </div>
  );
}
