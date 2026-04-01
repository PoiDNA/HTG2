// ---------------------------------------------------------------------------
// Mandala Pattern — default production pattern (complex, tests frame budget)
//
// Radial symmetry with bezier petal layers that react to audio energy.
// Uses HTG brand colors. Respects maxBrightness for watermark readability.
// Target: <4ms render time per frame.
// ---------------------------------------------------------------------------

import type { Pattern, RenderContext } from './types';
import { HTG_PALETTE } from './types';

// Pre-computed colors with alpha (avoid creating strings per frame)
const LAYER_COLORS = [
  { r: 90, g: 138, b: 78 },   // sage
  { r: 155, g: 74, b: 92 },   // indigo
  { r: 200, g: 148, b: 158 }, // lavender
  { r: 212, g: 168, b: 64 },  // warmGold
  { r: 61, g: 107, b: 50 },   // sageDark
];

function rgba(c: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

/** Number of radial symmetry folds */
const BASE_FOLDS = 8;
/** Maximum layers (reduced during degradation) */
const MAX_LAYERS = 5;

export const mandalaPattern: Pattern = {
  name: 'mandala',
  maxBrightness: 0.55, // keep bright elements dim for watermark

  render(ctx: RenderContext): void {
    const { ctx: c, width, height, time, audio } = ctx;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) * 0.42;

    // Audio-reactive parameters
    const rotationSpeed = 0.15 + audio.energy * 0.4;
    const petalScale = 0.6 + audio.midEnergy * 0.5;
    const layerCount = Math.max(2, Math.round(2 + audio.totalEnergy * (MAX_LAYERS - 2)));
    const folds = BASE_FOLDS + Math.round(audio.highEnergy * 4);
    const angleStep = (Math.PI * 2) / folds;

    for (let layer = 0; layer < layerCount; layer++) {
      const layerRatio = layer / Math.max(1, layerCount - 1);
      const color = LAYER_COLORS[layer % LAYER_COLORS.length];
      const radius = maxRadius * (0.25 + layerRatio * 0.75) * petalScale;
      const rotation = time * rotationSpeed * (layer % 2 === 0 ? 1 : -0.7) + layer * 0.3;

      // Alpha decreases for outer layers, clamped by maxBrightness
      const alpha = Math.min(
        mandalaPattern.maxBrightness,
        (0.15 + (1 - layerRatio) * 0.35) * (0.5 + audio.totalEnergy * 0.5),
      );

      c.save();
      c.translate(cx, cy);
      c.rotate(rotation);

      // Draw petals with bezier curves
      c.beginPath();
      for (let i = 0; i < folds; i++) {
        const angle = i * angleStep;
        const petalLength = radius * (0.6 + 0.4 * Math.sin(time * 0.5 + layer + i * 0.2));
        const petalWidth = radius * 0.18;

        const tipX = Math.cos(angle) * petalLength;
        const tipY = Math.sin(angle) * petalLength;
        const cp1Angle = angle - angleStep * 0.25;
        const cp2Angle = angle + angleStep * 0.25;
        const cpDist = petalWidth * (1.5 + audio.energy * 0.8);

        c.moveTo(0, 0);
        c.bezierCurveTo(
          Math.cos(cp1Angle) * cpDist, Math.sin(cp1Angle) * cpDist,
          tipX - Math.cos(angle + Math.PI / 2) * petalWidth * 0.3, tipY - Math.sin(angle + Math.PI / 2) * petalWidth * 0.3,
          tipX, tipY,
        );
        c.bezierCurveTo(
          tipX + Math.cos(angle + Math.PI / 2) * petalWidth * 0.3, tipY + Math.sin(angle + Math.PI / 2) * petalWidth * 0.3,
          Math.cos(cp2Angle) * cpDist, Math.sin(cp2Angle) * cpDist,
          0, 0,
        );
      }

      c.fillStyle = rgba(color, alpha * 0.5);
      c.fill();
      c.strokeStyle = rgba(color, alpha);
      c.lineWidth = 1;
      c.stroke();

      c.restore();
    }

    // Central glow (subtle)
    const glowAlpha = Math.min(mandalaPattern.maxBrightness * 0.4, 0.05 + audio.totalEnergy * 0.12);
    const gradient = c.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.3);
    gradient.addColorStop(0, `rgba(212,168,64,${glowAlpha})`); // warm gold
    gradient.addColorStop(1, 'rgba(212,168,64,0)');
    c.fillStyle = gradient;
    c.fillRect(cx - maxRadius * 0.3, cy - maxRadius * 0.3, maxRadius * 0.6, maxRadius * 0.6);
  },
};
