'use client';

import { useRef, useEffect, useCallback } from 'react';

interface DawTimelineProps {
  duration: number; // seconds
  zoom: number; // pixels per second
  scrollX: number;
  width: number;
  height?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Time ruler with markers at regular intervals.
 */
export function DawTimeline({ duration, zoom, scrollX, width, height = 28 }: DawTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1528';
    ctx.fillRect(0, 0, width, height);

    // Determine tick interval based on zoom level
    let majorInterval: number;
    let minorDivisions: number;

    if (zoom >= 200) {
      majorInterval = 1;
      minorDivisions = 10;
    } else if (zoom >= 100) {
      majorInterval = 2;
      minorDivisions = 4;
    } else if (zoom >= 50) {
      majorInterval = 5;
      minorDivisions = 5;
    } else if (zoom >= 20) {
      majorInterval = 10;
      minorDivisions = 5;
    } else if (zoom >= 10) {
      majorInterval = 30;
      minorDivisions = 6;
    } else {
      majorInterval = 60;
      minorDivisions = 6;
    }

    const minorInterval = majorInterval / minorDivisions;

    // Draw ticks
    const startTime = Math.floor(scrollX / zoom / minorInterval) * minorInterval;
    const endTime = Math.min(duration, (scrollX + width) / zoom + minorInterval);

    for (let t = startTime; t <= endTime; t += minorInterval) {
      const x = t * zoom - scrollX;
      if (x < -1 || x > width + 1) continue;

      const isMajor = Math.abs(t % majorInterval) < 0.001 || Math.abs(t % majorInterval - majorInterval) < 0.001;

      if (isMajor) {
        ctx.strokeStyle = '#8B7AAF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - 12);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = '#8B7AAF';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(t), x, height - 14);
      } else {
        ctx.strokeStyle = '#4A3B6B';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, height - 6);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Bottom border
    ctx.strokeStyle = '#4A3B6B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
  }, [duration, zoom, scrollX, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  );
}
