'use client';

interface DawPlayheadProps {
  position: number; // seconds
  zoom: number; // pixels per second
  scrollX: number;
  height: number;
  trackPanelWidth: number;
}

/**
 * Vertical red line indicating current playback position.
 */
export function DawPlayhead({ position, zoom, scrollX, height, trackPanelWidth }: DawPlayheadProps) {
  const x = position * zoom - scrollX + trackPanelWidth;

  if (x < trackPanelWidth || x > trackPanelWidth + 10000) return null;

  return (
    <div
      className="absolute top-0 pointer-events-none z-30"
      style={{
        left: x,
        height,
        width: 2,
        backgroundColor: '#ef4444',
      }}
    >
      {/* Playhead top indicator */}
      <div
        className="absolute -top-1 -left-[5px] w-3 h-3 bg-red-500 rounded-full"
        style={{ boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)' }}
      />
    </div>
  );
}
