// ---------------------------------------------------------------------------
// drawWatermark — pure rendering function extracted from WatermarkOverlay.tsx
//
// Draws a floating watermark with a stable dark halo for readability.
// Called as the last step in MandalaCanvas's rAF loop.
// Does NOT manage canvas sizing, rAF, or lifecycle — that's MandalaCanvas's job.
// ---------------------------------------------------------------------------

/**
 * Draw watermark text with a stable semi-transparent halo background.
 *
 * @param ctx      - Canvas 2D context (already scaled for DPR)
 * @param width    - Logical canvas width (px)
 * @param height   - Logical canvas height (px)
 * @param text     - Watermark text (e.g., "user@email.com | abc12345")
 * @param time     - Current time in seconds (for drift animation)
 * @param frozen   - If true, watermark stays at fixed position (prefers-reduced-motion)
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  time: number,
  frozen: boolean,
): void {
  ctx.save();

  // Position: slow drift unless frozen (reduced-motion)
  let x: number;
  let y: number;

  if (frozen) {
    // Fixed position — center-ish, slightly offset
    x = width * 0.5;
    y = height * 0.35;
  } else {
    // Slow sinusoidal drift (matching original WatermarkOverlay behavior)
    const t = time / 10; // slow drift
    x = width * (0.1 + 0.8 * ((Math.sin(t * 0.7) + 1) / 2));
    y = height * (0.15 + 0.7 * ((Math.cos(t * 0.5) + 1) / 2));
  }

  // Font setup
  const fontSize = Math.max(12, Math.min(width * 0.018, 22));
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure text for halo sizing
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.4;
  const padding = fontSize * 0.6;

  // Primary mechanism: stable dark halo behind text
  const haloX = x - textWidth / 2 - padding;
  const haloY = y - textHeight / 2 - padding * 0.5;
  const haloW = textWidth + padding * 2;
  const haloH = textHeight + padding;
  const haloRadius = fontSize * 0.4;

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(haloX, haloY, haloW, haloH, haloRadius);
  ctx.fill();

  // Text with semi-transparency
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, x, y);

  ctx.restore();
}
