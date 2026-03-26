'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, X } from 'lucide-react';
import { BREAK_NOTIFICATION_SOUND } from '@/lib/live/constants';

interface BreakNotificationProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function BreakNotification({ visible, onDismiss }: BreakNotificationProps) {
  const t = useTranslations('Live');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (visible) {
      const audio = new Audio(BREAK_NOTIFICATION_SOUND);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      audioRef.current = audio;
    }

    return () => {
      audioRef.current?.pause();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
      bg-htg-warm/90 text-white px-6 py-3 rounded-xl shadow-lg backdrop-blur-sm
      animate-in slide-in-from-top duration-300">
      <Pause className="w-5 h-5 flex-shrink-0" />
      <span className="font-medium">{t('break_notification')}</span>
      <button
        onClick={onDismiss}
        className="flex items-center justify-center w-8 h-8 rounded-full
          bg-white/20 hover:bg-white/30 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
