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
    const audio = new Audio('https://htg2-cdn.b-cdn.net/music-sessions/music-0.mp3');
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
      className="relative flex flex-col items-center justify-between w-full h-screen bg-[#0a0e1a] overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      {/* Controls: Back + Fullscreen */}
      <LiveControls />

      {/* Full-screen particle animation */}
      <SessionAnimation variant={0} opacity={0.8} active />

      {/* Top centered info */}
      <div className="relative z-10 pt-24 text-center">
        <p className="text-white/40 text-sm font-light tracking-[0.3em] animate-pulse">
          Oczekiwanie na rozpoczęcie sesji
        </p>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: music hint */}
      <div className="relative z-10 pb-8 text-center">
        {!musicPlaying && (
          <p className="text-white/20 text-xs">
            Kliknij aby włączyć muzykę
          </p>
        )}
      </div>
    </div>
  );
}
