'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import SessionAnimation from './SessionAnimation';
import LiveControls from './LiveControls';
import PreJoinCheck from './PreJoinCheck';
import ClientRecorder from './ClientRecorder';

interface WaitingRoomProps {
  bookingId?: string;
  liveSessionId?: string;
  onAdmitted?: () => void;
}

export default function WaitingRoom({ bookingId, liveSessionId, onAdmitted }: WaitingRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [deviceChecked, setDeviceChecked] = useState(false);
  const targetVolume = useRef(0.3);

  useEffect(() => {
    const audio = new Audio('https://htg2-cdn.b-cdn.net/music-sessions/music-0.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    audio.play().then(() => setMusicPlaying(true)).catch(() => {});
    return () => { audio.pause(); audio.src = ''; audioRef.current = null; };
  }, []);

  // Smooth fade to target volume over ~1.5s
  const fadeTo = useCallback((target: number, durationMs = 1500) => {
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

  const handleRecordingStart = useCallback(() => {
    // Fade music down to silence
    fadeTo(0, 2000);
  }, [fadeTo]);

  const handleRecordingStop = useCallback(() => {
    // Fade music back up
    const audio = audioRef.current;
    if (audio) {
      audio.volume = 0;
      audio.play().catch(() => {});
      fadeTo(targetVolume.current, 2000);
    }
  }, [fadeTo]);

  function handleClick() {
    if (!musicPlaying && audioRef.current) {
      audioRef.current.play().then(() => setMusicPlaying(true)).catch(() => {});
    }
  }

  return (
    <div
      className="relative flex flex-col items-center w-full h-screen bg-[#0a0e1a] overflow-auto"
      onClick={!deviceChecked ? undefined : handleClick}
    >
      <LiveControls />
      <SessionAnimation variant={0} opacity={0.8} active />

      {!deviceChecked ? (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <PreJoinCheck bookingId={bookingId} onReady={() => setDeviceChecked(true)} />
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-4 pt-20 pb-8 gap-6">
          <p className="text-white/40 text-sm font-light tracking-[0.3em] animate-pulse">
            Oczekiwanie na rozpoczęcie sesji
          </p>

          {bookingId && liveSessionId && (
            <ClientRecorder
              bookingId={bookingId}
              liveSessionId={liveSessionId}
              type="before"
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
            />
          )}

          {!musicPlaying && (
            <p className="text-white/20 text-xs cursor-pointer" onClick={handleClick}>
              Kliknij aby włączyć muzykę
            </p>
          )}
        </div>
      )}
    </div>
  );
}
