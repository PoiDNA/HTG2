'use client';

interface DawSelectionProps {
  start: number; // seconds
  end: number; // seconds
  zoom: number;
  scrollX: number;
  height: number;
  trackPanelWidth: number;
}

/**
 * Gold-tinted selection overlay spanning all tracks.
 */
export function DawSelection({
  start,
  end,
  zoom,
  scrollX,
  height,
  trackPanelWidth,
}: DawSelectionProps) {
  const left = start * zoom - scrollX + trackPanelWidth;
  const right = end * zoom - scrollX + trackPanelWidth;
  const width = right - left;

  if (width <= 0) return null;

  return (
    <div
      className="absolute top-0 pointer-events-none z-20"
      style={{
        left: Math.max(trackPanelWidth, left),
        width: width - Math.max(0, trackPanelWidth - left),
        height,
        backgroundColor: 'rgba(204, 149, 68, 0.15)',
        borderLeft: left >= trackPanelWidth ? '1px solid rgba(204, 149, 68, 0.6)' : undefined,
        borderRight: '1px solid rgba(204, 149, 68, 0.6)',
      }}
    />
  );
}
