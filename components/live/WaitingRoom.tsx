'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [deviceChecked, setDeviceChecked] = useState(false);

  useEffect(() => {
    const audio = new Audio('https://htg2-cdn.b-cdn.net/music-sessions/music-0.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    audio.play().then(() => setMusicPlaying(true)).catch(() => {});
    return () => { audio.pause(); audio.src = ''; audioRef.current = null; };
  }, []);

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
          <PreJoinCheck onReady={() => setDeviceChecked(true)} />
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-4 pt-20 pb-8 gap-6">
          {/* Status */}
          <p className="text-white/40 text-sm font-light tracking-[0.3em] animate-pulse">
            Oczekiwanie na rozpoczęcie sesji
          </p>

          {/* Recorder */}
          {bookingId && liveSessionId && (
            <ClientRecorder
              bookingId={bookingId}
              liveSessionId={liveSessionId}
              type="before"
            />
          )}

          {/* Music hint */}
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
