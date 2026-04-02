// ---------------------------------------------------------------------------
// drawWatermark — pure rendering function for player watermark
//
// Draws a static watermark in the bottom-left corner with a dark halo.
// Called as the last step in MandalaCanvas's rAF loop.
// ---------------------------------------------------------------------------

/**
 * Draw watermark text with a stable semi-transparent halo background.
 *
 * @param ctx      - Canvas 2D context (already scaled for DPR)
 * @param width    - Logical canvas width (px)
 * @param height   - Logical canvas height (px)
 * @param text     - Watermark text (e.g., "HTG | user@email.com | 12345678")
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void {
  ctx.save();

  // Font setup
  const fontSize = Math.max(10, Math.min(width * 0.016, 18));
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // Position: fixed bottom-left with padding
  const paddingX = fontSize * 0.8;
  const paddingY = fontSize * 0.8;
  const x = paddingX;
  const y = height - paddingY;

  // Measure text for halo sizing
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;
  const haloPad = fontSize * 0.4;

  // Dark halo behind text
  const haloX = x - haloPad;
  const haloY = y - textHeight - haloPad * 0.3;
  const haloW = textWidth + haloPad * 2;
  const haloH = textHeight + haloPad;
  const haloRadius = fontSize * 0.3;

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(haloX, haloY, haloW, haloH, haloRadius);
  ctx.fill();

  // Text
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, x, y);

  ctx.restore();
}
