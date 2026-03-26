'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import SessionAnimation from './SessionAnimation';
import { OUTRO_TIMER_DURATION } from '@/lib/live/constants';

interface OutroScreenProps {
  onClose: () => void;
}

export default function OutroScreen({ onClose }: OutroScreenProps) {
  const t = useTranslations('Live');
  const [remainingMs, setRemainingMs] = useState(OUTRO_TIMER_DURATION);
  const startTimeRef = useRef(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio('/audio/live/music-3.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audio.play().catch(() => {});
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, OUTRO_TIMER_DURATION - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [onClose]);

  const formatTime = useCallback((ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-screen bg-htg-indigo overflow-hidden">
      <SessionAnimation variant={3} opacity={0.5} active />

      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-6">
        <h1 className="text-3xl font-serif text-htg-cream">
          {t('outro_title')}
        </h1>
        <p className="text-htg-cream/70 text-lg max-w-md">
          {t('outro_message')}
        </p>

        {/* Countdown */}
        <div className="flex items-center justify-center w-24 h-24 rounded-full
          bg-white/10 backdrop-blur-sm border border-white/20">
          <span className="text-2xl font-mono text-htg-cream">
            {formatTime(remainingMs)}
          </span>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-2 px-6 py-3 rounded-xl
            bg-htg-warm text-white font-medium
            hover:bg-htg-warm/90 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {t('end_session')}
        </button>
      </div>
    </div>
  );
}
