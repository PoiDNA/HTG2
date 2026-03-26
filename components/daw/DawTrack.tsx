'use client';

import { DawWaveform } from './DawWaveform';
import { DawTrackPanel } from './DawTrackPanel';
import type { DawTrack as DawTrackType, TimeSelection } from '@/lib/daw/editor-state';

interface DawTrackProps {
  track: DawTrackType;
  zoom: number;
  scrollX: number;
  waveformWidth: number;
  height: number;
  selection: TimeSelection | null;
  peakLevel: number;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  labels: {
    solo: string;
    mute: string;
  };
}

/**
 * Single track row: left panel + waveform canvas.
 */
export function DawTrack({
  track,
  zoom,
  scrollX,
  waveformWidth,
  height,
  selection,
  peakLevel,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onMouseDown,
  onMouseMove,
  labels,
}: DawTrackProps) {
  const trackHeight = height;

  return (
    <div className="flex" style={{ height: trackHeight }}>
      <DawTrackPanel
        name={track.name}
        color={track.color}
        volume={track.volume}
        mute={track.mute}
        solo={track.solo}
        peakLevel={peakLevel}
        onVolumeChange={onVolumeChange}
        onMuteToggle={onMuteToggle}
        onSoloToggle={onSoloToggle}
        labels={labels}
      />
      <div
        className="flex-1 relative cursor-crosshair border-b"
        style={{
          backgroundColor: '#120f1e',
          borderColor: '#4A3B6B30',
          overflow: 'hidden',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        <DawWaveform
          peaks={track.peaks}
          regions={track.regions}
          sampleRate={track.audioBuffer?.sampleRate ?? 48000}
          totalOriginalSamples={track.audioBuffer?.length ?? 0}
          color={track.color}
          zoom={zoom}
          scrollX={scrollX}
          height={trackHeight}
          width={waveformWidth}
          selection={selection}
        />
      </div>
    </div>
  );
}
