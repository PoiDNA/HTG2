'use client';

import { useEffect, useRef, useState } from 'react';
import SessionAnimation from './SessionAnimation';
import LiveControls from './LiveControls';

interface WaitingRoomProps {
  onAdmitted?: () => void;
}

export default function WaitingRoom({ onAdmitted }: WaitingRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);

  useEffect(() => {
    // Auto-play looped waiting music
    const audio = new Audio('/audio/live/music-0.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    audio.play().then(() => setMusicPlaying(true)).catch(() => {
      // Autoplay blocked — will play after click
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  function handleClick() {
    if (!musicPlaying && audioRef.current) {
      audioRef.current.play().then(() => setMusicPlaying(true)).catch(() => {});
    }
  }

  return (
    <div
      className="relative flex items-end justify-center w-full h-screen bg-[#0a0e1a] overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      {/* Controls: Back + Fullscreen */}
      <LiveControls />

      {/* Full-screen particle animation */}
      <SessionAnimation variant={0} opacity={0.8} active />

      {/* Subtle bottom info — no spinner, no big text */}
      <div className="relative z-10 pb-12 text-center">
        <p className="text-white/30 text-sm font-light tracking-widest animate-pulse">
          Oczekiwanie na rozpoczęcie sesji...
        </p>

        {!musicPlaying && (
          <p className="text-white/20 text-xs mt-3">
            Kliknij aby włączyć muzykę
          </p>
        )}
      </div>
    </div>
  );
}
