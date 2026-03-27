'use client';

import { useEffect, useRef, useState } from 'react';
import SessionAnimation from './SessionAnimation';
import LiveControls from './LiveControls';
import PreJoinCheck from './PreJoinCheck';

interface WaitingRoomProps {
  onAdmitted?: () => void;
}

export default function WaitingRoom({ onAdmitted }: WaitingRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [deviceChecked, setDeviceChecked] = useState(false);

  useEffect(() => {
    const audio = new Audio('https://htg2-cdn.b-cdn.net/music-sessions/music-0.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    audio.play().then(() => setMusicPlaying(true)).catch(() => {});

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
      className="relative flex flex-col items-center w-full h-screen bg-[#0a0e1a] overflow-hidden"
      onClick={!deviceChecked ? undefined : handleClick}
    >
      {/* Controls: Back + Fullscreen */}
      <LiveControls />

      {/* Full-screen particle animation */}
      <SessionAnimation variant={0} opacity={0.8} active />

      {/* Pre-join check (centered) or waiting message */}
      {!deviceChecked ? (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <PreJoinCheck onReady={() => setDeviceChecked(true)} />
        </div>
      ) : (
        <>
          {/* Top centered info */}
          <div className="relative z-10 pt-24 text-center">
            <p className="text-white/40 text-sm font-light tracking-[0.3em] animate-pulse">
              Oczekiwanie na rozpoczęcie sesji
            </p>
          </div>

          <div className="flex-1" />

          {/* Bottom: music hint */}
          <div className="relative z-10 pb-8 text-center">
            {!musicPlaying && (
              <p className="text-white/20 text-xs cursor-pointer" onClick={handleClick}>
                Kliknij aby włączyć muzykę
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
