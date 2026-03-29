'use client';

import { useState, useRef, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import type { AudioAttachment } from '@/lib/community/types';

interface VoicePlayerProps {
  attachment: AudioAttachment;
}

/**
 * Inline voice note player with waveform visualization.
 * Shows pre-computed waveform data from attachment metadata.
 */
export function VoicePlayer({ attachment }: VoicePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveform = attachment.metadata?.waveform ?? [];
  const duration = attachment.metadata?.duration_sec ?? 0;

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }, [playing]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const pct = audioRef.current.currentTime / audioRef.current.duration;
    setProgress(pct);
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Generate waveform bars (use metadata or fallback)
  const bars = waveform.length > 0
    ? waveform
    : Array.from({ length: 30 }, () => 0.2 + Math.random() * 0.6);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-htg-surface rounded-xl max-w-sm">
      <audio
        ref={audioRef}
        src={`/api/community/media?path=${attachment.url}`}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-htg-sage text-white flex items-center justify-center shrink-0 hover:bg-htg-sage-dark transition-colors"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform */}
      <div className="flex items-end gap-px h-7 flex-1">
        {bars.map((val, i) => {
          const barProgress = i / bars.length;
          const isPlayed = barProgress <= progress;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-colors ${
                isPlayed ? 'bg-htg-sage' : 'bg-htg-card-border'
              }`}
              style={{ height: `${Math.max(3, val * 28)}px` }}
            />
          );
        })}
      </div>

      <span className="text-xs text-htg-fg-muted tabular-nums shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}
