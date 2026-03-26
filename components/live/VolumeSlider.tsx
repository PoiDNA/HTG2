'use client';

import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';

interface VolumeSliderProps {
  participantName: string;
  /** Callback to adjust volume (0-1) */
  onVolumeChange: (volume: number) => void;
  initialVolume?: number;
}

export default function VolumeSlider({
  participantName,
  onVolumeChange,
  initialVolume = 1,
}: VolumeSliderProps) {
  const [volume, setVolume] = useState(initialVolume);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      onVolumeChange(val);
    },
    [onVolumeChange],
  );

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-htg-surface">
      <Volume2 className="w-4 h-4 text-htg-fg-muted flex-shrink-0" />
      <span className="text-sm text-htg-fg-muted min-w-[80px] truncate">
        {participantName}
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleChange}
        className="flex-1 h-2 rounded-full appearance-none bg-htg-card-border
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-htg-warm
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}
