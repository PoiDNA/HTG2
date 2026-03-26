'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { AudioRegion } from '@/lib/daw/editor-state';

interface DawWaveformProps {
  peaks: Float32Array | null;
  regions: AudioRegion[];
  sampleRate: number;
  totalOriginalSamples: number;
  color: string;
  zoom: number; // pixels per second
  scrollX: number; // scroll offset in pixels
  height: number;
  width: number;
  selection: { start: number; end: number } | null;
}

/**
 * Canvas-based waveform renderer.
 * Draws filled waveform from pre-computed peak data,
 * respecting the non-destructive region edits.
 */
export function DawWaveform({
  peaks,
  regions,
  sampleRate,
  totalOriginalSamples,
  color,
  zoom,
  scrollX,
  height,
  width,
  selection,
}: DawWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute the duration from regions
  const regionsDuration = regions.reduce((sum, r) => sum + (r.end - r.start), 0) / sampleRate;
  const totalWidth = regionsDuration * zoom;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const peaksPerSample = peaks.length / totalOriginalSamples;

    // Draw each region
    let xCursor = 0; // position in the virtual timeline (pixels)

    for (const region of regions) {
      const regionSamples = region.end - region.start;
      const regionWidth = (regionSamples / sampleRate) * zoom;
      const regionXStart = xCursor;
      const regionXEnd = xCursor + regionWidth;

      // Check if this region is visible
      if (regionXEnd < scrollX || regionXStart > scrollX + width) {
        xCursor += regionWidth;
        continue;
      }

      // Draw waveform for this region
      const startPeak = Math.floor(region.start * peaksPerSample);
      const endPeak = Math.floor(region.end * peaksPerSample);
      const numPeaks = endPeak - startPeak;

      if (numPeaks <= 0) {
        xCursor += regionWidth;
        continue;
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;

      const pixelsPerPeak = regionWidth / numPeaks;

      for (let i = 0; i < numPeaks; i++) {
        const x = regionXStart + i * pixelsPerPeak - scrollX;
        if (x + pixelsPerPeak < 0 || x > width) continue;

        let peakVal = peaks[startPeak + i] || 0;

        // Apply fade-in
        if (region.fadeIn > 0) {
          const samplePos = (i / numPeaks) * regionSamples;
          if (samplePos < region.fadeIn) {
            peakVal *= samplePos / region.fadeIn;
          }
        }

        // Apply fade-out
        if (region.fadeOut > 0) {
          const samplePos = (i / numPeaks) * regionSamples;
          if (samplePos > regionSamples - region.fadeOut) {
            const fadePos = samplePos - (regionSamples - region.fadeOut);
            peakVal *= 1 - fadePos / region.fadeOut;
          }
        }

        const barHeight = peakVal * centerY * 0.9;
        const barWidth = Math.max(1, pixelsPerPeak - 0.5);

        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
      }

      ctx.globalAlpha = 1;

      // Draw fade indicators
      if (region.fadeIn > 0) {
        const fadeWidth = (region.fadeIn / sampleRate) * zoom;
        const fadeX = regionXStart - scrollX;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fadeX, centerY);
        ctx.lineTo(fadeX + fadeWidth, centerY - height * 0.35);
        ctx.stroke();
        ctx.moveTo(fadeX, centerY);
        ctx.lineTo(fadeX + fadeWidth, centerY + height * 0.35);
        ctx.stroke();
      }

      if (region.fadeOut > 0) {
        const fadeWidth = (region.fadeOut / sampleRate) * zoom;
        const fadeX = regionXEnd - scrollX;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fadeX, centerY - height * 0.35);
        ctx.lineTo(fadeX - fadeWidth, centerY);
        ctx.stroke();
        ctx.moveTo(fadeX, centerY + height * 0.35);
        ctx.lineTo(fadeX - fadeWidth, centerY);
        ctx.stroke();
      }

      xCursor += regionWidth;
    }

    // Draw selection overlay
    if (selection) {
      const selStartPx = selection.start * zoom - scrollX;
      const selEndPx = selection.end * zoom - scrollX;
      ctx.fillStyle = 'rgba(204, 149, 68, 0.3)';
      ctx.fillRect(selStartPx, 0, selEndPx - selStartPx, height);
    }

    // Draw center line
    ctx.strokeStyle = `${color}40`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, [peaks, regions, sampleRate, totalOriginalSamples, color, zoom, scrollX, height, width, selection]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
      data-total-width={totalWidth}
    />
  );
}
