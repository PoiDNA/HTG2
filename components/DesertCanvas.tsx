'use client';

// DesertCanvas — Wariant B: "Pole energetyczne" (energy field)
// 30 dużych, miękkich plam światła. Dryfują ledwie zauważalnie, oddychają.
// Efekt: spokój, przestrzeń, bezpieczeństwo — wspierające tło serwisu duchowego.

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Paleta — ciepłe aureole, spójne z design systemem HTG2 ─────────────────
// Bardzo niskie opacity — tło oddycha, nie rozprasza
const ORBS: Array<{ r: number; g: number; b: number }> = [
  { r: 220, g: 178, b:  72 },  // ciepłe złoto    (--color-htg-warm)
  { r: 212, g: 158, b: 120 },  // brzoskwiniowy    (pochodna cream)
  { r: 200, g: 148, b: 158 },  // blady różowy     (--color-htg-lavender)
  { r: 240, g: 210, b: 150 },  // jasna kremowa    (świetlistość)
  { r: 190, g: 160, b: 210 },  // delikatny fiolet (głębokość)
];

interface Orb {
  x:           number;   // pozycja X
  y:           number;   // pozycja Y
  vx:          number;   // drift poziomy (px/klatkę)
  vy:          number;   // drift pionowy
  baseR:       number;   // bazowy promień (80–200 px)
  breathAmp:   number;   // amplituda oddechu (0.08–0.18 promienia)
  breathSpeed: number;   // tempo oddechu (rad/klatkę)
  breathPhase: number;   // faza startowa — każda kula oddycha inaczej
  ci:          number;   // indeks koloru w ORBS[]
  maxOpacity:  number;   // max opacity plamy (0.06–0.15)
}

// ─── Komponent ───────────────────────────────────────────────────────────────
export default function DesertCanvas() {
  const { resolvedTheme } = useTheme();
  const variant = useDesignVariant();
  const [mounted, setMounted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => { setMounted(true); }, []);

  const active = mounted && resolvedTheme !== 'dark' && variant === 'v1';

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width        = Math.round(W * dpr);
      canvas.height       = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    resize();

    // ─── Tworzenie pól energetycznych ────────────────────────────────────────
    function makeOrb(): Orb {
      return {
        x:           Math.random() * W,
        y:           Math.random() * H,
        // Bardzo wolny, ledwie wyczuwalny dryf — 0.05–0.20 px/klatkę
        vx:          (Math.random() - 0.5) * 0.18,
        vy:          (Math.random() - 0.5) * 0.18,
        baseR:       80 + Math.random() * 120,    // 80–200 px
        breathAmp:   0.08 + Math.random() * 0.10, // ±8–18% promienia
        breathSpeed: 0.004 + Math.random() * 0.006, // pełen oddech ~20–30 s
        breathPhase: Math.random() * Math.PI * 2,
        ci:          Math.floor(Math.random() * ORBS.length),
        maxOpacity:  0.07 + Math.random() * 0.08, // 0.07–0.15 — subtelne
      };
    }

    const COUNT = 30;
    const orbs: Orb[] = Array.from({ length: COUNT }, makeOrb);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        // Przeskaluj pozycje do nowych wymiarów ekranu
        for (const o of orbs) {
          o.x = Math.random() * W;
          o.y = Math.random() * H;
        }
      }, 200);
    });
    ro.observe(document.documentElement);

    // ─── Pętla animacji ───────────────────────────────────────────────────────
    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      if (reducedMotion) return;

      for (const o of orbs) {
        // Oddech — promień pulsuje spokojnie
        const r = o.baseR * (1 + o.breathAmp * Math.sin(t * o.breathSpeed + o.breathPhase));

        // Dryf — ledwie zauważalny ruch
        o.x += o.vx;
        o.y += o.vy;

        // Miękkie odbicie od krawędzi — bez nagłych zmian
        if (o.x < -r)     { o.x = -r;     o.vx =  Math.abs(o.vx); }
        if (o.x > W + r)  { o.x = W + r;  o.vx = -Math.abs(o.vx); }
        if (o.y < -r)     { o.y = -r;     o.vy =  Math.abs(o.vy); }
        if (o.y > H + r)  { o.y = H + r;  o.vy = -Math.abs(o.vy); }

        // Rysuj jako gradient radialny: kolor w centrum → przezroczysty na zewnątrz
        const { r: cr, g, b } = ORBS[o.ci];
        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
        grad.addColorStop(0,   `rgba(${cr},${g},${b},${o.maxOpacity.toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(${cr},${g},${b},${(o.maxOpacity * 0.4).toFixed(3)})`);
        grad.addColorStop(1,   `rgba(${cr},${g},${b},0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearTimeout(resizeTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', display: 'block' }}
    />
  );
}
