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
}

const PHASE_ICONS: Partial<Record<Phase, React.ReactNode>> = {
  poczekalnia: <UserCheck className="w-5 h-5" />,
  wstep: <ArrowRight className="w-5 h-5" />,
  przejscie_1: <Play className="w-5 h-5" />,
  sesja: <Square className="w-5 h-5" />,
  podsumowanie: <LogOut className="w-5 h-5" />,
};

export default function PhaseControls({
  sessionId,
  currentPhase,
  isStaff,
  onPhaseChanged,
  compact = false,
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
        className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl
          bg-htg-warm text-white font-medium text-xs
          hover:bg-htg-warm/90 transition-colors active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {PHASE_ICONS[currentPhase]}
        <span className="whitespace-nowrap">{loading ? '...' : t(buttonLabel)}</span>
      </button>
    );
  }

  return (
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
  );
}
