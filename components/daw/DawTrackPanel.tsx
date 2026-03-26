'use client';

import { useRef, useEffect, useCallback } from 'react';

interface DawTrackPanelProps {
  name: string;
  color: string;
  volume: number;
  mute: boolean;
  solo: boolean;
  peakLevel: number; // 0-1 real-time peak for meter
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  labels: {
    solo: string;
    mute: string;
  };
}

/**
 * Left sidebar panel for a single track.
 * Shows name, solo/mute buttons, volume slider, and a peak meter.
 */
export function DawTrackPanel({
  name,
  color,
  volume,
  mute,
  solo,
  peakLevel,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  labels,
}: DawTrackPanelProps) {
  const meterRef = useRef<HTMLCanvasElement>(null);

  const drawMeter = useCallback(() => {
    const canvas = meterRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 6;
    const h = 80;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1a1528';
    ctx.fillRect(0, 0, w, h);

    // Level
    const levelH = peakLevel * h;
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, '#7A9E7E');
    gradient.addColorStop(0.7, '#D4A76A');
    gradient.addColorStop(1, '#ef4444');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h - levelH, w, levelH);
  }, [peakLevel]);

  useEffect(() => {
    drawMeter();
  }, [drawMeter]);

  return (
    <div
      className="flex flex-col gap-2 p-3 border-r border-b"
      style={{
        borderColor: '#4A3B6B40',
        backgroundColor: '#1a1528',
        width: 180,
        minWidth: 180,
      }}
    >
      {/* Track name with color indicator */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium text-white truncate">{name}</span>
      </div>

      {/* Solo / Mute buttons */}
      <div className="flex gap-1">
        <button
          onClick={onSoloToggle}
          className="px-2 py-1 text-[10px] font-bold rounded transition-colors"
          style={{
            backgroundColor: solo ? '#D4A76A' : '#2d2a3e',
            color: solo ? '#1a1528' : '#8B7AAF',
          }}
          title={labels.solo}
        >
          S
        </button>
        <button
          onClick={onMuteToggle}
          className="px-2 py-1 text-[10px] font-bold rounded transition-colors"
          style={{
            backgroundColor: mute ? '#ef4444' : '#2d2a3e',
            color: mute ? '#ffffff' : '#8B7AAF',
          }}
          title={labels.mute}
        >
          M
        </button>
      </div>

      {/* Volume slider + meter */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-htg-lavender"
          style={{ accentColor: color }}
        />
        <canvas
          ref={meterRef}
          style={{ width: 6, height: 40 }}
          className="shrink-0 rounded-sm"
        />
      </div>

      {/* Volume value */}
      <span className="text-[10px] text-htg-fg-muted">
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
}
