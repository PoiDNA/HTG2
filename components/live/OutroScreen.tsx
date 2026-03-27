'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import SessionAnimation from './SessionAnimation';
import ClientRecorder from './ClientRecorder';
import { OUTRO_TIMER_DURATION } from '@/lib/live/constants';

interface OutroScreenProps {
  bookingId?: string;
  liveSessionId?: string;
  onClose: () => void;
}

export default function OutroScreen({ bookingId, liveSessionId, onClose }: OutroScreenProps) {
  const t = useTranslations('Live');
  const [remainingMs, setRemainingMs] = useState(OUTRO_TIMER_DURATION);
  const startTimeRef = useRef(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const audio = new Audio('https://htg2-cdn.b-cdn.net/music-sessions/music-3.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, OUTRO_TIMER_DURATION - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0) { clearInterval(interval); onClose(); }
    }, 1000);
    return () => clearInterval(interval);
  }, [onClose]);

  const fadeTo = useCallback((target: number, durationMs = 2000) => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    const audio = audioRef.current;
    if (!audio) return;
    const steps = 30;
    const stepMs = durationMs / steps;
    const startVol = audio.volume;
    const delta = (target - startVol) / steps;
    let step = 0;
    fadeRef.current = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, startVol + delta * step));
      if (step >= steps) {
        if (fadeRef.current) clearInterval(fadeRef.current);
        audio.volume = Math.max(0, Math.min(1, target));
        if (target === 0) audio.pause();
      }
    }, stepMs);
  }, []);

  const handleRecordingStart = useCallback(() => fadeTo(0, 2000), [fadeTo]);
  const handleRecordingStop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.volume = 0; audio.play().catch(() => {}); fadeTo(0.3, 2000); }
  }, [fadeTo]);

  const formatTime = useCallback((ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="relative flex flex-col items-center w-full h-screen bg-htg-indigo overflow-auto">
      <SessionAnimation variant={3} opacity={0.5} active />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6 pt-16 pb-8 max-w-lg w-full">
        <h1 className="text-2xl font-serif text-htg-cream">
          {t('outro_title')}
        </h1>
        <p className="text-htg-cream/60 text-sm max-w-md">
          {t('outro_message')}
        </p>

        <div className="flex items-center justify-center w-20 h-20 rounded-full
          bg-white/10 backdrop-blur-sm border border-white/20">
          <span className="text-xl font-mono text-htg-cream">
            {formatTime(remainingMs)}
          </span>
        </div>

        {bookingId && liveSessionId && (
          <ClientRecorder
            bookingId={bookingId}
            liveSessionId={liveSessionId}
            type="after"
            onRecordingStart={handleRecordingStart}
            onRecordingStop={handleRecordingStop}
          />
        )}

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
