'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, UserCheck, ArrowRight, Square, LogOut } from 'lucide-react';
import type { Phase } from '@/lib/live/types';
import { VALID_TRANSITIONS, PHASE_BUTTON_LABELS } from '@/lib/live/constants';

interface PhaseControlsProps {
  sessionId: string;
  currentPhase: Phase;
  isStaff: boolean;
  onPhaseChanged?: (newPhase: Phase) => void;
  /** Compact single-column variant for circle row */
  compact?: boolean;
  /**
   * Real-time recording status from /api/live/recording-status polling.
   * - 'active'  — egress running normally, no warning shown
   * - 'pending' — waiting for consent OR LiveKit cold start (amber info)
   * - 'error'   — egress should be running but is not (red warning + Zoom suggestion)
   * - 'unknown' — could not verify, no warning shown
   */
  recordingStatus?: 'active' | 'pending' | 'error' | 'unknown';
}

const PHASE_ICONS: Partial<Record<Phase, React.ReactNode>> = {
  poczekalnia: <UserCheck className="w-5 h-5" />,
  wstep: <ArrowRight className="w-5 h-5" />,
  przejscie_1: <Play className="w-5 h-5" />,
  sesja: <Square className="w-5 h-5" />,
  przejscie_2: <ArrowRight className="w-5 h-5" />,
  podsumowanie: <LogOut className="w-5 h-5" />,
};

export default function PhaseControls({
  sessionId,
  currentPhase,
  isStaff,
  onPhaseChanged,
  compact = false,
  recordingStatus,
}: PhaseControlsProps) {
  const t = useTranslations('Live');
  const [loading, setLoading] = useState(false);

  if (!isStaff) return null;

  const nextPhase = VALID_TRANSITIONS[currentPhase];
  const buttonLabel = PHASE_BUTTON_LABELS[currentPhase];

  if (!nextPhase || !buttonLabel) return null;

  const handleAdvance = async () => {
    setLoading(true);
    try {
      // For poczekalnia, use the admit endpoint
      const endpoint = currentPhase === 'poczekalnia'
        ? '/api/live/admit'
        : '/api/live/phase';

      const body = currentPhase === 'poczekalnia'
        ? { sessionId }
        : { sessionId, newPhase: nextPhase };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onPhaseChanged?.(nextPhase);
      } else {
        const data = await res.json();
        console.error('Phase change failed:', data.error);
      }
    } catch (err) {
      console.error('Phase change error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleAdvance}
        disabled={loading}
        title={t(buttonLabel)}
        className="flex items-center justify-center w-12 h-12 rounded-full
          bg-htg-warm text-white
          hover:bg-htg-warm/90 transition-colors active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {PHASE_ICONS[currentPhase]}
      </button>
    );
  }

  // Recording warnings only relevant during sesja phase
  const showPendingWarning = currentPhase === 'sesja' && recordingStatus === 'pending';
  const showErrorWarning = currentPhase === 'sesja' && recordingStatus === 'error';

  return (
    <div className="flex flex-col gap-2">
      {showPendingWarning && (
        <p className="text-xs text-amber-300/80 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-2">
          Sesja jeszcze się nie nagrywa. Czekamy na potwierdzenie od drugiej osoby lub start nagrywania.
        </p>
      )}
      {showErrorWarning && (
        <p className="text-xs text-red-200 bg-red-900/40 border border-red-500/40 rounded-lg px-3 py-2">
          ⚠ Nagrywanie nie działa! Rozważ przełączenie sesji na ZOOM (przycisk u dołu po lewej).
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAdvance}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 rounded-xl
            bg-htg-warm text-white font-medium
            hover:bg-htg-warm/90 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {PHASE_ICONS[currentPhase]}
          {loading ? t('loading') : t(buttonLabel)}
        </button>
      </div>
    </div>
  );
}
