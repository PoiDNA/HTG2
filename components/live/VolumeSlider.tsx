'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface VolumeSliderProps {
  participantName: string;
  onVolumeChange: (volume: number) => void;
  initialVolume?: number;
}

export default function VolumeSlider({
  participantName,
  onVolumeChange,
  initialVolume = 1,
}: VolumeSliderProps) {
  const [volume, setVolume] = useState(initialVolume);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      onVolumeChange(val);
    },
    [onVolumeChange],
  );

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  return (
    <div ref={containerRef} className="relative">
      {/* Icon button — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        title={`Głośność: ${participantName}`}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-all
          ${expanded ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40 hover:bg-white/15 hover:text-white/70'}`}
      >
        {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {/* Expandable slider — appears above the icon */}
      {expanded && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2
          bg-black/80 backdrop-blur-md rounded-xl px-3 py-3 shadow-xl border border-white/10">
          <span className="text-[10px] text-white/60 whitespace-nowrap">{participantName}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleChange}
            className="w-24 h-1.5 rounded-full appearance-none bg-white/20 rotate-0
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-htg-warm
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
