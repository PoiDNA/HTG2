'use client';

import { useEffect, useRef } from 'react';

const CYCLE_MS = 5200;

// Phase boundaries (0–1 in cycle)
const T_FORM_START = 0.07;
const T_HOLD_START = 0.58;
const T_CRUMBLE_START = 0.72;

interface Particle {
  homeX: number;
  homeY: number;
  startX: number;
  startY: number;
  crumbleVx: number;
  crumbleVy: number;
  crumbleDelay: number; // 0–0.7, head crumbles first
  size: number;
  hue: number;
  saturation: number;
  lightness: number;
  normalizedY: number;
}

function buildParticles(W: number, H: number): Particle[] {
  const cx = W / 2;
  const cy = H * 0.47;
  const scale = Math.min(W * 0.44, H * 0.52);

  const homePos: Array<[number, number]> = [];

  const fillCircle = (nx: number, ny: number, r: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = r * Math.sqrt(Math.random());
      homePos.push([nx + Math.cos(a) * rr, ny + Math.sin(a) * rr]);
    }
  };

  const fillRect = (nx: number, ny: number, w: number, h: number, n: number) => {
    for (let i = 0; i < n; i++) {
      homePos.push([nx + (Math.random() - 0.5) * w, ny + (Math.random() - 0.5) * h]);
    }
  };

  // Humanoid silhouette — normalized coords, roughly −0.5..0.5
  fillCircle(0, -0.57, 0.11, 52);       // head
  fillRect(0, -0.41, 0.06, 0.07, 12);   // neck
  fillRect(0, -0.23, 0.27, 0.28, 95);   // torso
  fillRect(-0.22, -0.19, 0.09, 0.33, 44); // left upper arm
  fillRect(0.22, -0.19, 0.09, 0.33, 44);  // right upper arm
  fillRect(-0.24, 0.07, 0.09, 0.24, 34);  // left forearm
  fillRect(0.24, 0.07, 0.09, 0.24, 34);   // right forearm
  fillRect(-0.09, 0.20, 0.10, 0.35, 54);  // left leg
  fillRect(0.09, 0.20, 0.10, 0.35, 54);   // right leg
  fillRect(-0.12, 0.41, 0.14, 0.07, 18);  // left foot
  fillRect(0.12, 0.41, 0.14, 0.07, 18);   // right foot

  return homePos.map(([nx, ny]) => {
    const homeX = cx + nx * scale;
    const homeY = cy + ny * scale;

    // Random scatter origin
    const sa = Math.random() * Math.PI * 2;
    const sd = (0.45 + Math.random() * 0.7) * Math.max(W, H) * 0.38;
    const startX = cx + Math.cos(sa) * sd;
    const startY = cy + Math.sin(sa) * sd;

    // Crumble direction: outward from center with randomness
    const dirX = homeX - cx;
    const dirY = homeY - cy;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const spd = 0.9 + Math.random() * 1.3;
    const crumbleVx = (dirX / dirLen) * spd + (Math.random() - 0.5) * 0.7;
    const crumbleVy = (dirY / dirLen) * spd * 0.4 - 0.4 - Math.random() * 0.5;

    // Head crumbles first (low ny = high in screen = small normalizedY)
    const normalizedY = (ny + 0.68) / 1.16; // ≈ 0 at head, ≈ 1 at feet
    const crumbleDelay = normalizedY * 0.68;

    const useRose = Math.random() < 0.6;
    const hue = useRose
      ? 330 + Math.random() * 22   // rose/crimson
      : 22 + Math.random() * 22;   // warm gold/amber

    return {
      homeX,
      homeY,
      startX,
      startY,
      crumbleVx,
      crumbleVy,
      crumbleDelay,
      size: 1.3 + Math.random() * 2.1,
      hue,
      saturation: 55 + Math.random() * 30,
      lightness: 50 + Math.random() * 22,
      normalizedY,
    };
  });
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function HeroHostCrumble() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setup = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      particlesRef.current = buildParticles(canvas.width, canvas.height);
    };

    setup();

    const ro = new ResizeObserver(setup);
    ro.observe(canvas.parentElement!);

    const loop = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const cycleT = ((ts - startRef.current) % CYCLE_MS) / CYCLE_MS;

      const W = canvas.width;
      const H = canvas.height;
      const dark = document.documentElement.classList.contains('dark');

      ctx.clearRect(0, 0, W, H);

      particlesRef.current.forEach((p) => {
        let x: number, y: number, alpha: number;

        if (cycleT < T_FORM_START) {
          x = p.startX;
          y = p.startY;
          alpha = 0;
        } else if (cycleT < T_HOLD_START) {
          const prog = (cycleT - T_FORM_START) / (T_HOLD_START - T_FORM_START);
          const eased = easeOutCubic(prog);
          x = p.startX + (p.homeX - p.startX) * eased;
          y = p.startY + (p.homeY - p.startY) * eased;
          alpha = Math.min(1, prog * 2.8);
        } else if (cycleT < T_CRUMBLE_START) {
          x = p.homeX;
          y = p.homeY;
          alpha = 1;
        } else {
          const phaseProg = (cycleT - T_CRUMBLE_START) / (1 - T_CRUMBLE_START);
          const localT = Math.max(0, (phaseProg - p.crumbleDelay) / (1 - p.crumbleDelay + 0.001));

          if (localT <= 0) {
            x = p.homeX;
            y = p.homeY;
            alpha = 1;
          } else {
            const travel = Math.min(W, H) * 0.52;
            x = p.homeX + p.crumbleVx * localT * travel;
            y = p.homeY + p.crumbleVy * localT * travel + 0.45 * travel * localT * localT;
            alpha = Math.max(0, 1 - localT * 1.4);
          }
        }

        if (alpha <= 0.01) return;

        // Color: lighter/brighter in dark mode, deeper in light mode
        const sat = dark ? p.saturation : p.saturation * 0.65;
        const lit = dark ? p.lightness : p.lightness * 0.52;
        const color = `hsl(${p.hue},${sat}%,${lit}%)`;

        ctx.globalAlpha = alpha;

        if (dark) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 5;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.7 + alpha * 0.3), 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      aria-hidden="true"
    />
  );
}
