'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Unlock } from 'lucide-react';
import type { Room } from 'livekit-client';

interface PrivateTalkButtonProps {
  room: Room | null;
  isStaff: boolean;
}

export default function PrivateTalkButton({ room, isStaff }: PrivateTalkButtonProps) {
  const t = useTranslations('Live');
  const [isPrivate, setIsPrivate] = useState(false);

  const togglePrivateTalk = useCallback(async () => {
    if (!room) return;

    const encoder = new TextEncoder();
    const newState = !isPrivate;

    const message = JSON.stringify({
      type: newState ? 'private_talk_start' : 'private_talk_stop',
    });

    try {
      await room.localParticipant.publishData(encoder.encode(message), {
        reliable: true,
      });
      setIsPrivate(newState);
    } catch (err) {
      console.error('Failed to toggle private talk:', err);
    }
  }, [room, isPrivate]);

  if (!isStaff) return null;

  return (
    <button
      onClick={togglePrivateTalk}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors ${
        isPrivate
          ? 'bg-red-600/20 text-red-400 border border-red-600/30'
          : 'bg-htg-surface text-htg-fg-muted hover:bg-htg-surface/80 border border-htg-card-border'
      }`}
    >
      {isPrivate ? <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      <span className="hidden sm:inline">{isPrivate ? t('private_talk_active') : t('private_talk')}</span>
      <span className="sm:hidden">{isPrivate ? 'Prywatna' : 'Prywatna'}</span>
    </button>
  );
}
