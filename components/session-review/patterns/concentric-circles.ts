// ---------------------------------------------------------------------------
// Concentric Circles Pattern — dev-only benchmark (simple, baseline perf)
//
// Available only when NEXT_PUBLIC_DEV_BENCHMARK=1.
// Expanding rings from center, audio-reactive spacing and thickness.
// Used to measure baseline frame budget on mobile.
// ---------------------------------------------------------------------------

import type { Pattern, RenderContext } from './types';

const RING_COLOR = { r: 90, g: 138, b: 78 }; // sage
const ACCENT_COLOR = { r: 155, g: 74, b: 92 }; // indigo

export const concentricCirclesPattern: Pattern = {
  name: 'concentric-circles',
  maxBrightness: 0.5,

  render(ctx: RenderContext): void {
    const { ctx: c, width, height, time, audio } = ctx;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) * 0.45;

    const ringCount = 8 + Math.round(audio.totalEnergy * 6);
    const baseSpacing = maxRadius / ringCount;
    const breathe = 1 + audio.energy * 0.25;

    for (let i = 1; i <= ringCount; i++) {
      const ratio = i / ringCount;
      const radius = i * baseSpacing * breathe;

      if (radius > maxRadius * 1.1) break;

      // Thickness reacts to mid energy
      const thickness = 1 + audio.midEnergy * 2.5 * (1 - ratio * 0.5);

      // Hue shift with high energy — alternate between sage and indigo
      const useAccent = i % 3 === 0;
      const color = useAccent ? ACCENT_COLOR : RING_COLOR;

      // Alpha: inner rings brighter, outer dimmer
      const alpha = Math.min(
        concentricCirclesPattern.maxBrightness,
        (0.12 + (1 - ratio) * 0.25) * (0.4 + audio.totalEnergy * 0.6),
      );

      // Slow expansion animation
      const expandOffset = (time * 15 + i * 7) % (baseSpacing * 2);

      c.beginPath();
      c.arc(cx, cy, Math.max(1, radius + expandOffset - baseSpacing), 0, Math.PI * 2);
      c.strokeStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
      c.lineWidth = thickness;
      c.stroke();
    }
  },
};
