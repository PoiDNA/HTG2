'use client';

import { useEffect, useRef } from 'react';

// Green palette — dark to light
const GREEN_DARK = [
  [10, 50, 25],    // very dark
  [20, 80, 45],
  [30, 110, 65],
  [52, 152, 90],
  [80, 185, 120],
  [120, 210, 155],
];

const GREEN_LIGHT = [
  [5, 70, 30],
  [15, 100, 55],
  [25, 130, 75],
  [40, 160, 100],
  [70, 185, 130],
  [100, 200, 150],
];

function rand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export default function MomentyGlobe({ fragmentIndex }: { fragmentIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const setup = () => {
      const parent = canvas.parentElement!;
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      canvas.width = size;
      canvas.height = size;
    };

    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(canvas.parentElement!);

    const rng = rand(fragmentIndex * 137 + 42);

    // Pre-generate layer configs for this fragment
    const layers = Array.from({ length: 6 }, (_, i) => ({
      baseRadius: 0.14 + i * 0.09,
      speed: 0.4 + rng() * 0.8,
      phaseOffset: rng() * Math.PI * 2,
      amplitude: 0.02 + rng() * 0.05,
      noiseAmp: rng() * 0.03,
    }));

    const loop = (ts: number) => {
      timeRef.current = ts / 1000;
      const t = timeRef.current;

      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.42;
      const dark = document.documentElement.classList.contains('dark');
      const palette = dark ? GREEN_DARK : GREEN_LIGHT;

      ctx.clearRect(0, 0, W, H);

      // Speech-like wave: combination of slow + fast oscillations
      const speechWave = (
        Math.sin(t * 2.3 + fragmentIndex) * 0.5 +
        Math.sin(t * 5.7) * 0.3 +
        Math.sin(t * 11.3) * 0.15 +
        Math.sin(t * 17.9) * 0.05
      );

      // Draw layers from outside in
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const [r, g, b] = palette[i] || palette[palette.length - 1];

        const wave = Math.sin(t * layer.speed + layer.phaseOffset) * layer.amplitude;
        const speechContrib = speechWave * layer.amplitude * 0.8;
        const radius = R * (layer.baseRadius + wave + speechContrib);

        const alpha = dark
          ? 0.25 + (i / layers.length) * 0.45
          : 0.15 + (i / layers.length) * 0.5;

        // Glow for inner layers in dark mode
        if (dark && i >= layers.length - 2) {
          ctx.shadowColor = `rgb(${r},${g},${b})`;
          ctx.shadowBlur = 20;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulsing ring on outermost layer
      const ringRadius = R * (layers[0].baseRadius + Math.sin(t * 1.8) * 0.04 + speechWave * 0.04);
      ctx.globalAlpha = dark ? 0.35 : 0.2;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgb(${palette[1][0]},${palette[1][1]},${palette[1][2]})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [fragmentIndex]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      aria-hidden="true"
    />
  );
}
