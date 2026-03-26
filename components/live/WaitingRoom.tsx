'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import SessionAnimation from './SessionAnimation';

interface WaitingRoomProps {
  onAdmitted?: () => void;
}

export default function WaitingRoom({ onAdmitted }: WaitingRoomProps) {
  const t = useTranslations('Live');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Auto-play looped waiting music
    const audio = new Audio('/audio/live/music-0.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    // Attempt autoplay — may be blocked by browser
    audio.play().catch(() => {
      // Autoplay blocked — user will hear music after interaction
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // onAdmitted is called externally when phase changes
  useEffect(() => {
    if (onAdmitted) {
      // This is a prop — the parent component triggers it
    }
  }, [onAdmitted]);

  return (
    <div className="relative flex items-center justify-center w-full h-screen bg-htg-indigo overflow-hidden">
      <SessionAnimation variant={0} opacity={0.6} active />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6">
        <Loader2 className="w-12 h-12 text-htg-warm animate-spin" />
        <h1 className="text-2xl font-serif text-htg-cream">
          {t('waiting_title')}
        </h1>
        <p className="text-htg-cream/70 text-lg max-w-md">
          {t('waiting_message')}
        </p>
      </div>
    </div>
  );
}
