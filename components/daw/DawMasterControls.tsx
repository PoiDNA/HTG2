'use client';

interface DawMasterControlsProps {
  volume: number;
  onVolumeChange: (v: number) => void;
  labels: {
    master_volume: string;
  };
}

/**
 * Master volume control at the bottom of the DAW.
 */
export function DawMasterControls({
  volume,
  onVolumeChange,
  labels,
}: DawMasterControlsProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-t"
      style={{
        backgroundColor: '#1a1528',
        borderColor: '#4A3B6B40',
      }}
    >
      <span className="text-[11px] text-[#8B7AAF] font-medium shrink-0">
        {labels.master_volume}
      </span>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.01}
        value={volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="w-32 h-1"
        style={{ accentColor: '#D4A76A' }}
      />
      <span className="text-[10px] text-[#D4A76A] font-mono w-10">
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
}
