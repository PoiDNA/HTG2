'use client';

import { useEffect, useRef } from 'react';

interface WatermarkOverlayProps {
  userEmail: string;
  userId: string;
}

export default function WatermarkOverlay({ userEmail, userId }: WatermarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0.2, y: 0.3 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = `${userEmail} | ${userId.slice(0, 8)}`;

    function draw() {
      if (!canvas || !ctx) return;

      // Match canvas size to element size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Floating position — slow drift
      const time = Date.now() / 10000;
      const x = rect.width * (0.1 + 0.8 * ((Math.sin(time * 0.7) + 1) / 2));
      const y = rect.height * (0.15 + 0.7 * ((Math.cos(time * 0.5) + 1) / 2));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.15);

      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, 0);

      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [userEmail, userId]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      aria-hidden="true"
    />
  );
}
