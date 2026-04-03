// ---------------------------------------------------------------------------
// Lotus Pattern — realistic lotus flower with audio-reactive dynamics
//
// Uses offscreen canvas sprites (cached, rebuilt on resize) for petals,
// leaves, and center. Water drawn live each frame for fluid dynamics.
// Audio reactivity: energy → water waves, midEnergy → petal sway (wind),
// highEnergy → color-dodge shimmer, totalEnergy → scene brightness.
// Target: <4ms render time per frame (sprites via drawImage).
// ---------------------------------------------------------------------------

import type { Pattern, RenderContext } from './types';

// ---------------------------------------------------------------------------
// Color palette (pre-allocated RGB for per-frame alpha composition)
// ---------------------------------------------------------------------------
const C = {
  // Petals — warm salmon/coral from the photo, sunlit edges
  petalPink:  { r: 218, g: 120, b: 130 },  // saturated warm pink (mid-petal)
  petalLight: { r: 240, g: 175, b: 170 },  // sunlit inner glow
  petalDeep:  { r: 195, g: 80, b: 95 },    // deep shadow folds
  petalTip:   { r: 250, g: 205, b: 195 },  // bright warm highlight at tips
  petalEdge:  { r: 210, g: 100, b: 110 },  // crisp edge color
  // Center — golden yellow, honeycomb seedpod
  centerGold: { r: 230, g: 195, b: 55 },
  centerDark: { r: 175, g: 135, b: 25 },
  centerWarm: { r: 245, g: 215, b: 100 },  // warm highlight
  // Leaves — rich deep green from the photo, with lighter veins
  leafDark:   { r: 30, g: 85, b: 30 },
  leafMid:    { r: 55, g: 125, b: 50 },
  leafLight:  { r: 85, g: 165, b: 70 },
  leafBright: { r: 110, g: 190, b: 85 },   // sunlit leaf edges
  // Water
  waterDeep:  { r: 15, g: 42, b: 28 },
  waterMid:   { r: 28, g: 65, b: 42 },
  waterLight: { r: 42, g: 90, b: 58 },
  // Background — deep forest green, not black
  bgDeep:     { r: 10, g: 22, b: 14 },
  bgMid:      { r: 18, g: 35, b: 22 },
  bgWarm:     { r: 25, g: 42, b: 28 },     // warm glow zone behind flower
};

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// ---------------------------------------------------------------------------
// Sprite cache — rebuilt when canvas size changes
// ---------------------------------------------------------------------------
interface SpriteCache {
  outerPetal: HTMLCanvasElement;
  innerPetal: HTMLCanvasElement;
  leaf: HTMLCanvasElement;
  center: HTMLCanvasElement;
  shimmerPetal: HTMLCanvasElement;
  cachedW: number;
  cachedH: number;
}

let cache: SpriteCache | null = null;

function createOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return [c, c.getContext('2d')!];
}

// ---------------------------------------------------------------------------
// Sprite generators (called once per resize, complexity goes here)
// ---------------------------------------------------------------------------

function generateOuterPetal(petalW: number, petalH: number): HTMLCanvasElement {
  const [cv, c] = createOffscreen(petalW * 1.2, petalH * 1.2);
  const ox = cv.width / 2;
  const oy = cv.height;

  // Petal shape — elongated teardrop
  c.beginPath();
  c.moveTo(ox, oy);
  c.bezierCurveTo(
    ox - petalW * 0.55, oy - petalH * 0.35,
    ox - petalW * 0.45, oy - petalH * 0.85,
    ox, oy - petalH,
  );
  c.bezierCurveTo(
    ox + petalW * 0.45, oy - petalH * 0.85,
    ox + petalW * 0.55, oy - petalH * 0.35,
    ox, oy,
  );
  c.closePath();

  // Rich multi-point gradient — deep folds to sunlit tips (vivid, high alpha)
  const grad = c.createLinearGradient(ox - petalW * 0.4, oy, ox + petalW * 0.1, oy - petalH);
  grad.addColorStop(0, rgba(C.petalDeep, 1));
  grad.addColorStop(0.25, rgba(C.petalPink, 0.95));
  grad.addColorStop(0.55, rgba(C.petalLight, 0.92));
  grad.addColorStop(0.8, rgba(C.petalTip, 0.9));
  grad.addColorStop(1, rgba(C.petalTip, 0.85));
  c.fillStyle = grad;
  c.fill();

  // Secondary warm overlay — adds depth like the sunlit photo
  const warmGrad = c.createRadialGradient(ox * 0.9, oy - petalH * 0.35, 0, ox, oy - petalH * 0.4, petalH * 0.5);
  warmGrad.addColorStop(0, rgba(C.petalLight, 0.25));
  warmGrad.addColorStop(1, 'rgba(240,175,170,0)');
  c.fillStyle = warmGrad;
  c.fill();

  // Veins — many fine strokes radiating from base (like real lotus veins)
  c.save();
  c.clip(); // clip to petal shape
  c.lineWidth = 0.6;
  for (let i = -4; i <= 4; i++) {
    const angle = (i / 8) * 0.5;
    const veinAlpha = 0.12 + Math.abs(i) * 0.01;
    c.strokeStyle = rgba(C.petalDeep, veinAlpha);
    c.beginPath();
    c.moveTo(ox, oy);
    const endX = ox + Math.sin(angle) * petalW * 0.25;
    const endY = oy - petalH * 0.88;
    c.quadraticCurveTo(
      ox + Math.sin(angle) * petalW * 0.12,
      oy - petalH * 0.5,
      endX, endY,
    );
    c.stroke();
  }
  // Central vein (stronger)
  c.strokeStyle = rgba(C.petalDeep, 0.18);
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(ox, oy);
  c.quadraticCurveTo(ox, oy - petalH * 0.5, ox, oy - petalH * 0.9);
  c.stroke();
  c.restore();

  // Crisp edge highlight — warm coral edge
  c.beginPath();
  c.moveTo(ox, oy);
  c.bezierCurveTo(
    ox - petalW * 0.55, oy - petalH * 0.35,
    ox - petalW * 0.45, oy - petalH * 0.85,
    ox, oy - petalH,
  );
  c.bezierCurveTo(
    ox + petalW * 0.45, oy - petalH * 0.85,
    ox + petalW * 0.55, oy - petalH * 0.35,
    ox, oy,
  );
  c.strokeStyle = rgba(C.petalEdge, 0.4);
  c.lineWidth = 1.2;
  c.stroke();

  return cv;
}

function generateInnerPetal(petalW: number, petalH: number): HTMLCanvasElement {
  const [cv, c] = createOffscreen(petalW * 1.2, petalH * 1.2);
  const ox = cv.width / 2;
  const oy = cv.height;

  // Rounder, shorter shape
  c.beginPath();
  c.moveTo(ox, oy);
  c.bezierCurveTo(
    ox - petalW * 0.5, oy - petalH * 0.4,
    ox - petalW * 0.4, oy - petalH * 0.9,
    ox, oy - petalH,
  );
  c.bezierCurveTo(
    ox + petalW * 0.4, oy - petalH * 0.9,
    ox + petalW * 0.5, oy - petalH * 0.4,
    ox, oy,
  );
  c.closePath();

  // Inner petals are lighter, warmer — catching more light
  const grad = c.createLinearGradient(ox, oy, ox, oy - petalH);
  grad.addColorStop(0, rgba(C.petalPink, 0.95));
  grad.addColorStop(0.35, rgba(C.petalLight, 1));
  grad.addColorStop(0.7, rgba(C.petalTip, 0.95));
  grad.addColorStop(1, rgba(C.petalTip, 0.9));
  c.fillStyle = grad;
  c.fill();

  // Warm inner glow (subsurface light effect)
  const innerGlow = c.createRadialGradient(ox, oy - petalH * 0.5, 0, ox, oy - petalH * 0.4, petalH * 0.4);
  innerGlow.addColorStop(0, rgba(C.petalTip, 0.3));
  innerGlow.addColorStop(1, 'rgba(250,205,195,0)');
  c.fillStyle = innerGlow;
  c.fill();

  // Veins
  c.save();
  c.clip();
  c.strokeStyle = rgba(C.petalPink, 0.14);
  c.lineWidth = 0.5;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(ox, oy);
    c.quadraticCurveTo(
      ox + i * petalW * 0.08,
      oy - petalH * 0.5,
      ox + i * petalW * 0.05,
      oy - petalH * 0.8,
    );
    c.stroke();
  }
  c.restore();

  return cv;
}

function generateCenter(size: number): HTMLCanvasElement {
  const [cv, c] = createOffscreen(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;

  // Warm gold base with richer gradient
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, rgba(C.centerWarm, 1));
  grad.addColorStop(0.4, rgba(C.centerGold, 0.95));
  grad.addColorStop(0.75, rgba(C.centerDark, 0.9));
  grad.addColorStop(1, rgba(C.centerDark, 0.3));
  c.fillStyle = grad;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();

  // Honeycomb seed dots (fibonacci spiral — like the photo)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 40; i++) {
    const a = i * goldenAngle;
    const dist = Math.sqrt(i / 40) * r * 0.85;
    const dx = cx + Math.cos(a) * dist;
    const dy = cy + Math.sin(a) * dist;
    const dotR = size * 0.012 + (1 - dist / r) * size * 0.008;

    // Dark seed with bright rim
    c.fillStyle = rgba(C.centerDark, 0.6);
    c.beginPath();
    c.arc(dx, dy, dotR, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = rgba(C.centerWarm, 0.3);
    c.lineWidth = 0.5;
    c.stroke();
  }

  // Top highlight (catching light)
  const highlight = c.createRadialGradient(cx * 0.85, cy * 0.85, 0, cx, cy, r * 0.5);
  highlight.addColorStop(0, rgba(C.centerWarm, 0.3));
  highlight.addColorStop(1, 'rgba(245,215,100,0)');
  c.fillStyle = highlight;
  c.fillRect(0, 0, size, size);

  return cv;
}

function generateLeaf(leafW: number, leafH: number): HTMLCanvasElement {
  const [cv, c] = createOffscreen(leafW * 1.1, leafH * 1.1);
  const cx = cv.width / 2;
  const cy = cv.height / 2;
  const rX = leafW * 0.48;
  const rY = leafH * 0.48;

  // Slightly irregular circle (lotus leaf pad shape)
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 5) * 0.04 + Math.sin(a * 3) * 0.03;
    const x = cx + Math.cos(a) * rX * wobble;
    const y = cy + Math.sin(a) * rY * wobble;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();

  // Rich green gradient — vivid like the photo
  const grad = c.createRadialGradient(cx * 0.85, cy * 0.85, 0, cx, cy, rX);
  grad.addColorStop(0, rgba(C.leafBright, 0.8));
  grad.addColorStop(0.35, rgba(C.leafLight, 0.85));
  grad.addColorStop(0.65, rgba(C.leafMid, 0.9));
  grad.addColorStop(1, rgba(C.leafDark, 0.95));
  c.fillStyle = grad;
  c.fill();

  // Radial veins — lighter, more visible
  c.save();
  c.clip();
  c.strokeStyle = rgba(C.leafBright, 0.25);
  c.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * rX * 0.95, cy + Math.sin(a) * rY * 0.95);
    c.stroke();
  }
  c.restore();

  // Edge
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 5) * 0.04 + Math.sin(a * 3) * 0.03;
    const x = cx + Math.cos(a) * rX * wobble;
    const y = cy + Math.sin(a) * rY * wobble;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.strokeStyle = rgba(C.leafDark, 0.3);
  c.lineWidth = 1.5;
  c.stroke();

  return cv;
}

function generateShimmerPetal(petalW: number, petalH: number): HTMLCanvasElement {
  const [cv, c] = createOffscreen(petalW * 1.2, petalH * 1.2);
  const ox = cv.width / 2;
  const oy = cv.height;

  // Same shape as outer petal but softer, brighter (for composite blending)
  c.beginPath();
  c.moveTo(ox, oy);
  c.bezierCurveTo(
    ox - petalW * 0.55, oy - petalH * 0.35,
    ox - petalW * 0.45, oy - petalH * 0.85,
    ox, oy - petalH,
  );
  c.bezierCurveTo(
    ox + petalW * 0.45, oy - petalH * 0.85,
    ox + petalW * 0.55, oy - petalH * 0.35,
    ox, oy,
  );
  c.closePath();

  const grad = c.createRadialGradient(ox, oy - petalH * 0.4, 0, ox, oy - petalH * 0.4, petalH * 0.6);
  grad.addColorStop(0, rgba(C.petalTip, 0.9));
  grad.addColorStop(0.5, rgba(C.petalLight, 0.5));
  grad.addColorStop(1, rgba(C.petalPink, 0));
  c.fillStyle = grad;
  c.fill();

  return cv;
}

// ---------------------------------------------------------------------------
// Cache management — rebuild when size changes
// ---------------------------------------------------------------------------

function buildSprites(width: number, height: number): SpriteCache {
  const baseSize = Math.min(width, height);
  const outerPetalW = baseSize * 0.12;
  const outerPetalH = baseSize * 0.32;
  const innerPetalW = baseSize * 0.09;
  const innerPetalH = baseSize * 0.22;
  const centerSize = baseSize * 0.18;
  const leafW = baseSize * 0.45;
  const leafH = baseSize * 0.35;

  return {
    outerPetal: generateOuterPetal(outerPetalW, outerPetalH),
    innerPetal: generateInnerPetal(innerPetalW, innerPetalH),
    center: generateCenter(centerSize),
    leaf: generateLeaf(leafW, leafH),
    shimmerPetal: generateShimmerPetal(outerPetalW, outerPetalH),
    cachedW: width,
    cachedH: height,
  };
}

function getSprites(width: number, height: number): SpriteCache {
  if (!cache || Math.abs(cache.cachedW - width) > 50 || Math.abs(cache.cachedH - height) > 50) {
    cache = buildSprites(width, height);
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Water — drawn live each frame for fluid dynamics
// ---------------------------------------------------------------------------

function drawWater(
  c: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  energy: number,
  totalEnergy: number,
): void {
  const waterY = height * 0.7;
  const amplitude = 3 + energy * 12;
  const waveSpeed = time * 1.2;

  // Multiple wave layers for depth
  for (let layer = 0; layer < 3; layer++) {
    const layerY = waterY + layer * height * 0.06;
    const layerAlpha = 0.25 - layer * 0.06 + totalEnergy * 0.08;
    const layerSpeed = waveSpeed + layer * 0.5;
    const layerAmp = amplitude * (1 - layer * 0.25);
    const color = layer === 0 ? C.waterLight : layer === 1 ? C.waterMid : C.waterDeep;

    c.beginPath();
    c.moveTo(0, height);
    c.lineTo(0, layerY);

    // Smooth wave using bezier curves (20 segments)
    const segments = 20;
    const segW = width / segments;
    for (let i = 0; i <= segments; i++) {
      const x = i * segW;
      const y = layerY + Math.sin(x * 0.008 + layerSpeed) * layerAmp
        + Math.sin(x * 0.015 + layerSpeed * 0.7) * layerAmp * 0.5
        + Math.cos(x * 0.004 + layerSpeed * 1.3) * layerAmp * 0.3;
      if (i === 0) c.lineTo(x, y);
      else c.lineTo(x, y);
    }

    c.lineTo(width, height);
    c.closePath();

    c.fillStyle = rgba(color, layerAlpha);
    c.fill();
  }

  // Water surface highlight
  c.beginPath();
  for (let i = 0; i <= 30; i++) {
    const x = (i / 30) * width;
    const y = waterY + Math.sin(x * 0.008 + waveSpeed) * amplitude
      + Math.sin(x * 0.015 + waveSpeed * 0.7) * amplitude * 0.5;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.strokeStyle = rgba(C.waterLight, 0.15 + totalEnergy * 0.1);
  c.lineWidth = 1.5;
  c.stroke();
}

// ---------------------------------------------------------------------------
// Background — breathing gradient
// ---------------------------------------------------------------------------

function drawBackground(
  c: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  totalEnergy: number,
): void {
  // Base fill
  c.fillStyle = rgba(C.bgDeep, 1);
  c.fillRect(0, 0, width, height);

  // Breathing radial glow
  const breathe = 1 + Math.sin(time * 0.3) * 0.05 + totalEnergy * 0.1;
  const cx = width / 2;
  const cy = height * 0.45;
  const r = Math.min(width, height) * 0.6 * breathe;
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, rgba(C.bgMid, 0.4 + totalEnergy * 0.15));
  grad.addColorStop(0.6, rgba(C.bgDeep, 0.2));
  grad.addColorStop(1, 'rgba(13,26,18,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Leaf configurations (relative positions)
// ---------------------------------------------------------------------------

const LEAF_CONFIGS = [
  { x: 0.15, y: 0.72, scale: 1.0, rot: -0.2 },
  { x: 0.82, y: 0.70, scale: 0.9, rot: 0.15 },
  { x: 0.05, y: 0.55, scale: 0.7, rot: -0.4 },
  { x: 0.92, y: 0.58, scale: 0.65, rot: 0.35 },
];

// ---------------------------------------------------------------------------
// Petal configurations
// ---------------------------------------------------------------------------

const OUTER_PETALS = 10;
const INNER_PETALS = 8;

// ---------------------------------------------------------------------------
// Pollen particle system — golden dust floating from center
// ---------------------------------------------------------------------------

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; phase: number;
}

const MAX_PARTICLES = 24;
const particles: Particle[] = [];

function spawnParticle(cx: number, cy: number): void {
  if (particles.length >= MAX_PARTICLES) return;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.3 + Math.random() * 0.8;
  particles.push({
    x: cx + (Math.random() - 0.5) * 10,
    y: cy + (Math.random() - 0.5) * 10,
    vx: Math.cos(angle) * speed,
    vy: -Math.abs(Math.sin(angle)) * speed - 0.2,
    life: 0,
    maxLife: 120 + Math.random() * 120,
    size: 1.5 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
  });
}

function updateAndDrawParticles(
  c: CanvasRenderingContext2D,
  cx: number, cy: number,
  time: number, highEnergy: number, energy: number,
): void {
  // Spawn new particles on high-frequency hits
  if (highEnergy > 0.08 && Math.random() < highEnergy * 0.6) {
    spawnParticle(cx, cy);
    // Double spawn on strong hits
    if (highEnergy > 0.25 && Math.random() < 0.3) spawnParticle(cx, cy);
  }
  // Ambient spawn — steady gentle stream
  if (particles.length < 10 && Math.random() < 0.03) {
    spawnParticle(cx, cy);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    if (p.life > p.maxLife) {
      particles.splice(i, 1);
      continue;
    }

    // Wind drift
    p.vx += Math.sin(time * 1.5 + p.phase) * 0.01 * (1 + energy);
    p.vy -= 0.005; // gentle upward float
    p.x += p.vx;
    p.y += p.vy;

    const lifeRatio = p.life / p.maxLife;
    const fadeIn = Math.min(1, p.life / 15);
    const fadeOut = 1 - Math.max(0, (lifeRatio - 0.7) / 0.3);
    const alpha = fadeIn * fadeOut * 0.6;

    c.save();
    c.globalAlpha = alpha;
    const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + highEnergy));
    grad.addColorStop(0, rgba(C.centerWarm, 0.9));
    grad.addColorStop(0.5, rgba(C.centerGold, 0.4));
    grad.addColorStop(1, 'rgba(230,195,55,0)');
    c.fillStyle = grad;
    c.fillRect(p.x - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4);
    c.restore();
  }
}

// ---------------------------------------------------------------------------
// Helper: draw a petal with contact shadow
// ---------------------------------------------------------------------------

function drawPetalWithShadow(
  c: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  cx: number, cy: number,
  baseAngle: number, windPhase: number, breathScale: number,
  radius: number, alpha: number,
  shadowOffset: number,
): void {
  const w = sprite.width;
  const h = sprite.height;

  // Contact shadow (darker, offset, multiply)
  c.save();
  c.translate(cx, cy);
  c.rotate(baseAngle + windPhase);
  c.translate(shadowOffset * 0.5, shadowOffset);
  c.scale(breathScale * 1.02, breathScale * 1.02);
  c.globalAlpha = 0.2;
  c.globalCompositeOperation = 'multiply';
  c.drawImage(sprite, -w / 2, -h);
  c.restore();

  // Actual petal
  c.save();
  c.translate(cx, cy);
  c.rotate(baseAngle + windPhase);
  c.translate(0, -radius * 0.15);
  c.scale(breathScale, breathScale);
  c.globalAlpha = alpha;
  c.drawImage(sprite, -w / 2, -h);
  c.restore();
}

// ---------------------------------------------------------------------------
// Pattern export
// ---------------------------------------------------------------------------

export const lotusPattern: Pattern = {
  name: 'lotus',
  maxBrightness: 0.6,

  render(ctx: RenderContext): void {
    const { ctx: c, width, height, time, audio, interactionBurst } = ctx;
    const sprites = getSprites(width, height);
    const cx = width / 2;
    const cy = height * 0.45;
    const MB = lotusPattern.maxBrightness;
    const burst = interactionBurst ?? 0;

    // 1. Background (breathing gradient)
    drawBackground(c, width, height, time, audio.totalEnergy);

    // 2. Water (live, bottom area — gentle ripple boost on hover)
    drawWater(c, width, height, time, audio.energy + burst * 0.15, audio.totalEnergy + burst * 0.08);

    // Parallax offsets per layer — creates 3D depth illusion
    // Leaves: subtle (1x), Outer petals: medium (3x), Inner/Center: strong (5x)
    const parallaxBase = Math.min(width, height) * 0.003;
    const parallaxLeafX = Math.sin(time * 0.9) * parallaxBase * (1 + audio.midEnergy);
    const parallaxLeafY = Math.cos(time * 0.7) * parallaxBase * 0.7 * (1 + audio.midEnergy);
    const parallaxOuterX = Math.sin(time * 1.1) * parallaxBase * 3 * (1 + audio.midEnergy);
    const parallaxOuterY = Math.cos(time * 0.9) * parallaxBase * 2 * (1 + audio.midEnergy);
    const parallaxInnerX = Math.sin(time * 1.3) * parallaxBase * 5 * (1 + audio.midEnergy);
    const parallaxInnerY = Math.cos(time * 1.1) * parallaxBase * 3.5 * (1 + audio.midEnergy);

    // 3. Leaves (sprites, wind-swayed, with caustic light reflections + parallax)
    for (let i = 0; i < LEAF_CONFIGS.length; i++) {
      const cfg = LEAF_CONFIGS[i];
      const windOffset = Math.sin(time * 0.8 + i * 1.5) * 0.03 * (1 + audio.midEnergy * 2);
      const scaleBreath = cfg.scale * (1 + Math.sin(time * 0.4 + i) * 0.02 * (1 + audio.energy));
      const lw = sprites.leaf.width;
      const lh = sprites.leaf.height;
      const lx = cfg.x * width + parallaxLeafX;
      const ly = cfg.y * height + parallaxLeafY;

      c.save();
      c.translate(lx, ly);
      c.rotate(cfg.rot + windOffset);
      c.scale(scaleBreath, scaleBreath);
      c.globalAlpha = Math.min(MB, 0.55 + audio.totalEnergy * 0.15);
      c.drawImage(sprites.leaf, -lw / 2, -lh / 2);

      // Water caustic reflections on leaves — bright spots that move with energy
      const causticSpeed = 0.6 + audio.energy * 1.5;
      const causticAlpha = 0.08 + audio.energy * 0.08;
      for (let j = 0; j < 2; j++) {
        const causticX = Math.sin(time * causticSpeed + i * 2 + j * 3.14) * lw * 0.2;
        const causticY = Math.cos(time * causticSpeed * 0.7 + i + j * 2) * lh * 0.15;
        const causticR = lw * 0.12;
        const cGrad = c.createRadialGradient(causticX, causticY, 0, causticX, causticY, causticR);
        cGrad.addColorStop(0, rgba(C.leafBright, causticAlpha));
        cGrad.addColorStop(1, 'rgba(110,190,85,0)');
        c.globalAlpha = 1;
        c.fillStyle = cGrad;
        c.fillRect(causticX - causticR, causticY - causticR, causticR * 2, causticR * 2);
      }
      c.restore();
    }

    // Shadow offset based on wind
    const shadowOff = 2 + audio.midEnergy * 3;

    // Hover interaction: gentle bloom — soft scale, upward drift, subtle rotation
    const hoverEased = burst * burst * (3 - 2 * burst); // smoothstep for extra softness
    const burstScale = 1 + hoverEased * 0.35;           // 35% scale-up (slow, smooth)
    const burstRotation = hoverEased * 0.06;             // noticeable petal fan-out
    const burstAlphaBoost = hoverEased * 0.12;           // brightening
    const burstDriftY = -hoverEased * Math.min(height, width) * 0.07;  // strong upward float
    const burstSpin = hoverEased * 0.15;                 // clear whole-flower rotation

    // 4. Outer petals (phase-shifted wind + contact shadows + parallax + hover drift)
    const outerRadius = Math.min(width, height) * 0.14;
    const outerCx = cx + parallaxOuterX;
    const outerCy = cy + parallaxOuterY + burstDriftY;

    for (let i = 0; i < OUTER_PETALS; i++) {
      const baseAngle = (i / OUTER_PETALS) * Math.PI * 2 - Math.PI / 2 + burstSpin;
      // Gentle fan-out on hover
      const burstFan = (baseAngle > 0 ? 1 : -1) * burstRotation;
      const windPhase = Math.sin(time * 2.0 + i * 0.7) * 0.06 * (1 + audio.midEnergy * 3) + burstFan;
      const breathScale = (1 + Math.sin(time * 1.5 + i * 0.9) * 0.04 * (1 + audio.energy * 2)) * burstScale;
      const alpha = Math.min(MB, 0.75 + audio.totalEnergy * 0.2 + burstAlphaBoost);

      drawPetalWithShadow(c, sprites.outerPetal, outerCx, outerCy,
        baseAngle, windPhase, breathScale, outerRadius, alpha, shadowOff);
    }

    // 5. Inner petals (translucent overlaps via 'screen' + parallax + hover drift)
    const innerRadius = Math.min(width, height) * 0.06;
    const innerCx = cx + parallaxInnerX;
    const innerCy = cy + parallaxInnerY + burstDriftY;

    const prevCompInner = c.globalCompositeOperation;
    c.globalCompositeOperation = 'screen';

    for (let i = 0; i < INNER_PETALS; i++) {
      const baseAngle = (i / INNER_PETALS) * Math.PI * 2 - Math.PI / 2 + 0.2 + burstSpin * 1.2;
      const burstFan = (baseAngle > 0 ? 1 : -1) * burstRotation * 0.6;
      const windPhase = Math.sin(time * 1.6 + i * 0.8 + 2) * 0.04 * (1 + audio.midEnergy * 2) + burstFan;
      const breathScale = (1 + Math.sin(time * 1.2 + i * 1.1) * 0.03 * (1 + audio.energy)) * burstScale;
      const alpha = Math.min(MB, 0.65 + audio.totalEnergy * 0.15 + burstAlphaBoost);

      drawPetalWithShadow(c, sprites.innerPetal, innerCx, innerCy,
        baseAngle, windPhase, breathScale, innerRadius, alpha, shadowOff * 0.6);
    }

    c.globalCompositeOperation = prevCompInner;

    // 6. Center (pulsing, with strong parallax + hover drift)
    const centerSize = sprites.center.width;
    const centerPulse = (1 + audio.totalEnergy * 0.12 + Math.sin(time * 2) * 0.03) * burstScale;
    const centerParX = parallaxInnerX * 0.7;
    const centerParY = parallaxInnerY * 0.7 + burstDriftY;
    c.save();
    c.translate(cx + centerParX, cy + centerParY);
    c.rotate(burstSpin * 0.5);
    c.scale(centerPulse, centerPulse);
    c.globalAlpha = Math.min(MB, 0.85 + burstAlphaBoost);
    c.drawImage(sprites.center, -centerSize / 2, -centerSize / 2);
    c.restore();

    // 7. Pollen particles (golden dust) — extra spawn on hover
    updateAndDrawParticles(c, cx + centerParX, cy + centerParY, time,
      audio.highEnergy + hoverEased * 0.25, audio.energy + hoverEased * 0.15);

    // 7b. Soft warm glow on hover — gentle radial warmth from center
    if (hoverEased > 0.01) {
      c.save();
      c.globalCompositeOperation = 'screen';
      const glowCy = cy + burstDriftY;
      const glowR = Math.min(width, height) * 0.3;
      const glowGrad = c.createRadialGradient(cx, glowCy, 0, cx, glowCy, glowR);
      glowGrad.addColorStop(0, rgba(C.petalTip, hoverEased * 0.08));
      glowGrad.addColorStop(0.4, rgba(C.petalLight, hoverEased * 0.04));
      glowGrad.addColorStop(0.7, rgba(C.centerWarm, hoverEased * 0.02));
      glowGrad.addColorStop(1, 'rgba(245,215,100,0)');
      c.globalAlpha = 1;
      c.fillStyle = glowGrad;
      c.fillRect(cx - glowR, glowCy - glowR, glowR * 2, glowR * 2);
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }

    // 8. Pulsating vein highlights — energy pumps through the flower
    // Radial streaks from center that brighten with audio.energy
    const veinAlpha = Math.min(MB * 0.3, 0.02 + audio.energy * 0.18);
    if (veinAlpha > 0.015) {
      c.save();
      c.globalCompositeOperation = 'screen';
      const veinCount = 12;
      const veinR = Math.min(width, height) * 0.28;
      for (let i = 0; i < veinCount; i++) {
        const angle = (i / veinCount) * Math.PI * 2;
        // Each vein pulses with a slight phase offset — organic pumping
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.5 + i * 0.52);
        const thisAlpha = veinAlpha * pulse;
        if (thisAlpha < 0.01) continue;

        const endX = outerCx + Math.cos(angle) * veinR;
        const endY = outerCy + Math.sin(angle) * veinR;
        const vGrad = c.createLinearGradient(outerCx, outerCy, endX, endY);
        vGrad.addColorStop(0, rgba(C.petalLight, thisAlpha * 0.8));
        vGrad.addColorStop(0.3, rgba(C.petalPink, thisAlpha));
        vGrad.addColorStop(0.7, rgba(C.petalDeep, thisAlpha * 0.4));
        vGrad.addColorStop(1, 'rgba(195,80,95,0)');

        c.strokeStyle = vGrad;
        c.lineWidth = 2 + audio.energy * 3;
        c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(outerCx, outerCy);
        // Slightly curved vein path
        const cpX = outerCx + Math.cos(angle + 0.15) * veinR * 0.5;
        const cpY = outerCy + Math.sin(angle + 0.15) * veinR * 0.5;
        c.quadraticCurveTo(cpX, cpY, endX, endY);
        c.stroke();
      }
      c.restore();
    }

    // 9. Subsurface scattering — light passing through petals (screen blend)
    const sssAlpha = Math.min(MB * 0.35, 0.05 + audio.totalEnergy * 0.15);
    if (sssAlpha > 0.02) {
      const prevComp = c.globalCompositeOperation;
      c.globalCompositeOperation = 'screen';

      // Warm glow emanating from center through petals
      const sssR = Math.min(width, height) * 0.25;
      const sssGrad = c.createRadialGradient(cx, cy, 0, cx, cy, sssR);
      sssGrad.addColorStop(0, rgba(C.petalLight, sssAlpha));
      sssGrad.addColorStop(0.4, rgba(C.petalPink, sssAlpha * 0.5));
      sssGrad.addColorStop(1, 'rgba(240,175,170,0)');
      c.globalAlpha = 1;
      c.fillStyle = sssGrad;
      c.fillRect(cx - sssR, cy - sssR, sssR * 2, sssR * 2);

      c.globalCompositeOperation = prevComp;
    }

    // 10. Shimmer — screen blending on high frequencies (follows parallax)
    if (audio.highEnergy > 0.08) {
      const shimmerAlpha = Math.min(MB * 0.45, audio.highEnergy * 0.55);
      const prevComp = c.globalCompositeOperation;
      c.globalCompositeOperation = 'screen';

      const shimmerW = sprites.shimmerPetal.width;
      const shimmerH = sprites.shimmerPetal.height;
      for (let i = 0; i < OUTER_PETALS; i++) {
        const baseAngle = (i / OUTER_PETALS) * Math.PI * 2 - Math.PI / 2;
        const windPhase = Math.sin(time * 2.0 + i * 0.7) * 0.06 * (1 + audio.midEnergy * 3);
        const breathScale = 1 + Math.sin(time * 1.5 + i * 0.9) * 0.04 * (1 + audio.energy * 2);

        c.save();
        c.translate(outerCx, outerCy);
        c.rotate(baseAngle + windPhase);
        c.translate(0, -outerRadius * 0.15);
        c.scale(breathScale, breathScale);
        c.globalAlpha = shimmerAlpha * (0.4 + Math.sin(time * 3 + i * 1.2) * 0.6);
        c.drawImage(sprites.shimmerPetal, -shimmerW / 2, -shimmerH);
        c.restore();
      }

      // Central golden glow
      const glowR = Math.min(width, height) * 0.12;
      const glowGrad = c.createRadialGradient(outerCx, outerCy, 0, outerCx, outerCy, glowR);
      glowGrad.addColorStop(0, rgba(C.centerWarm, shimmerAlpha * 0.5));
      glowGrad.addColorStop(1, 'rgba(245,215,100,0)');
      c.fillStyle = glowGrad;
      c.globalAlpha = 1;
      c.fillRect(outerCx - glowR, outerCy - glowR, glowR * 2, glowR * 2);

      c.globalCompositeOperation = prevComp;
    }
  },
};
