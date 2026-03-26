'use client';

import { useEffect, useRef, useCallback } from 'react';
import SessionAnimation from './SessionAnimation';
import { MUSIC_FADE_DURATION } from '@/lib/live/constants';

interface PhaseTransitionProps {
  variant: number;
  musicSrc?: string;
  onComplete?: () => void;
  /** If true, music fades out when onComplete fires */
  autoFade?: boolean;
}

export default function PhaseTransition({
  variant,
  musicSrc,
  onComplete,
  autoFade = false,
}: PhaseTransitionProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const fadeOutAndStop = useCallback(() => {
    const gain = gainRef.current;
    const audioCtx = audioCtxRef.current;
    const audio = audioRef.current;

    if (gain && audioCtx && audio) {
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_DURATION / 1000);

      setTimeout(() => {
        audio.pause();
        onComplete?.();
      }, MUSIC_FADE_DURATION);
    } else {
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    if (!musicSrc) return;

    const audio = new Audio(musicSrc);
    audio.loop = true;
    audioRef.current = audio;

    // Set up Web Audio API for gain control
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      source.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = gain;
    } catch {
      // Web Audio API unavailable — fallback to normal audio
    }

    audio.play().catch(() => {
      // Autoplay blocked
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      gainRef.current = null;
    };
  }, [musicSrc]);

  // Auto-fade is triggered externally — this component exposes fadeOutAndStop
  useEffect(() => {
    if (autoFade) {
      fadeOutAndStop();
    }
  }, [autoFade, fadeOutAndStop]);

  return (
    <div className="relative flex items-center justify-center w-full h-screen bg-htg-indigo overflow-hidden">
      <SessionAnimation variant={variant} opacity={0.8} active />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-htg-warm/20 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-htg-warm animate-pulse" />
        </div>
      </div>
    </div>
  );
}
