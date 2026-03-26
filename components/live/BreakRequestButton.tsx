'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Check } from 'lucide-react';
import type { Room } from 'livekit-client';

interface BreakRequestButtonProps {
  room: Room | null;
  isStaff: boolean;
}

export default function BreakRequestButton({ room, isStaff }: BreakRequestButtonProps) {
  const t = useTranslations('Live');
  const [requested, setRequested] = useState(false);

  const requestBreak = useCallback(async () => {
    if (!room || requested) return;

    const encoder = new TextEncoder();
    const message = JSON.stringify({ type: 'break_request' });

    try {
      await room.localParticipant.publishData(encoder.encode(message), {
        reliable: true,
      });
      setRequested(true);
    } catch (err) {
      console.error('Failed to send break request:', err);
    }
  }, [room, requested]);

  // Only clients can request a break
  if (isStaff) return null;

  return (
    <button
      onClick={requestBreak}
      disabled={requested}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        requested
          ? 'bg-htg-sage/20 text-htg-sage border border-htg-sage/30'
          : 'bg-htg-surface text-htg-fg-muted hover:bg-htg-surface/80 border border-htg-card-border'
      }`}
    >
      {requested ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
      {requested ? t('break_confirmed') : t('break_request')}
    </button>
  );
}
