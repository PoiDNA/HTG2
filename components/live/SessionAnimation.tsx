'use client';

import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

interface SessionAnimationProps {
  variant?: number;
  opacity?: number;
  active?: boolean;
}

const VARIANT_COLORS: string[][] = [
  ['#D4A76A', '#7A9E7E', '#8B7AAF'],       // 0: poczekalnia — gold, sage, lavender
  ['#D4A76A', '#7A9E7E', '#5D4E7E'],       // 1: sesja — gold, sage, indigo-light
  ['#8B7AAF', '#7A9E7E', '#D4A76A'],       // 2: przejscie_2 — lavender, sage, gold
  ['#D4A76A', '#4A3B6B', '#7A9E7E'],       // 3: outro — gold, indigo, sage
];

const PARTICLE_COUNT = 40;

export default function SessionAnimation({
  variant = 0,
  opacity = 1,
  active = true,
}: SessionAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const reducedMotion = useRef(false);

  const initParticles = useCallback((width: number, height: number) => {
    const colors = VARIANT_COLORS[variant % VARIANT_COLORS.length];
    const particles: Particle[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 3 + 1,
        color: colors[i % colors.length],
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    particlesRef.current = particles;
  }, [variant]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Not mounted yet
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(rect.width, rect.height);
    };

    // Use ResizeObserver for reliable sizing
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    resize();
    window.addEventListener('resize', resize);

    // If reduced motion, draw static gradient and stop
    if (reducedMotion.current) {
      const rect = canvas.getBoundingClientRect();
      const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      gradient.addColorStop(0, '#4A3B6B');
      gradient.addColorStop(1, '#2D2A3E');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      return () => window.removeEventListener('resize', resize);
    }

    let lastTime = 0;
    const targetInterval = 1000 / 30; // 30fps

    const animate = (timestamp: number) => {
      if (!active) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = timestamp - lastTime;
      if (delta < targetInterval) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastTime = timestamp;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Dark indigo background
      ctx.fillStyle = '#2D2A3E';
      ctx.fillRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * opacity;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [variant, opacity, active, initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  );
}
