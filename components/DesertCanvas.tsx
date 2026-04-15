'use client';

// DesertCanvas — Wariant A1: "Oddech światła" (breath of light)
// Kilka dużych, bardzo miękkich kul światła. Dryfują jak świece w bezwietrznym powietrzu.
// Ciepłe złoto + blady różowy. Efekt: obecność, ciepło, bezpieczeństwo.

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Paleta — tylko ciepło i spokój ─────────────────────────────────────────
const COLORS = [
  { r: 222, g: 174, b:  68 },  // ciepłe złoto     (--color-htg-warm)
  { r: 230, g: 190, b:  90 },  // jasne złoto       (świetlistość)
  { r: 216, g: 168, b: 130 },  // brzoskwiniowo-złoty
  { r: 210, g: 150, b: 155 },  // blady różowy      (--color-htg-lavender)
  { r: 225, g: 165, b: 145 },  // ciepły łosoś
  { r: 235, g: 200, b: 160 },  // kremowa poświata
] as const;

interface Candle {
  x:           number;   // pozycja X (px)
  y:           number;   // pozycja Y (px)
  vx:          number;   // bardzo wolny dryf X
  vy:          number;   // bardzo wolny dryf Y
  baseR:       number;   // promień bazowy (200–400 px)
  breathAmp:   number;   // amplituda oddechu — ułamek promienia
  breathSpeed: number;   // tempo oddechu (rad/ms) — jeden cykl ~30–50 s
  breathPhase: number;   // faza startowa — każda świeca oddycha inaczej
  wobbleAmp:   number;   // mikro-chwianie (jak płomień świecy)
  wobbleSpeed: number;
  wobblePhase: number;
  ci:          number;   // indeks koloru
  maxOpacity:  number;   // peak opacity (0.09–0.18)
}

// Jedno wspólne tempo oddechu dla wszystkich kul — ~40 sekund pełny cykl
const BREATH_SPEED = 0.000085;  // rad/ms → 2π / 0.000085 ≈ 73 000 ms ≈ 40 s

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

    // ─── Tworzenie świec ──────────────────────────────────────────────────────
    function makeCandle(i: number, total: number): Candle {
      // Rozmieść równomiernie po ekranie z losowym przesunięciem
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cols = 3;
      const rows = Math.ceil(total / cols);
      return {
        x:           (col + 0.2 + Math.random() * 0.6) * (W / cols),
        y:           (row + 0.2 + Math.random() * 0.6) * (H / rows),
        // Jak świeca w bezwietrznym powietrzu — minimalny ruch
        vx:          (Math.random() - 0.5) * 0.06,
        vy:          (Math.random() - 0.5) * 0.06,
        baseR:       200 + Math.random() * 200,    // 200–400 px
        breathAmp:   0.06 + Math.random() * 0.08,  // ±6–14% promienia
        breathSpeed: BREATH_SPEED,                 // identyczne tempo dla wszystkich
        breathPhase: (i / total) * Math.PI * 2,   // równomiernie rozłożone fazy — jak zegar
        wobbleAmp:   0.015 + Math.random() * 0.01, // mikro-drganie płomienia
        wobbleSpeed: 0.003 + Math.random() * 0.004,
        wobblePhase: Math.random() * Math.PI * 2,
        ci:          i % COLORS.length,
        maxOpacity:  0.10 + Math.random() * 0.08,  // 0.10–0.18
      };
    }

    const COUNT = 9;  // 9 świec — 3×3 siatka pokrywająca ekran
    let candles: Candle[] = Array.from({ length: COUNT }, (_, i) => makeCandle(i, COUNT));

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        candles = Array.from({ length: COUNT }, (_, i) => makeCandle(i, COUNT));
      }, 200);
    });
    ro.observe(document.documentElement);

    // ─── Pętla animacji ───────────────────────────────────────────────────────
    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      if (reducedMotion) return;

      for (const c of candles) {
        // Oddech — spokojny, głęboki
        const breathR = c.baseR * (1 + c.breathAmp * Math.sin(t * c.breathSpeed + c.breathPhase));

        // Chwianie jak płomień — mikro-przesunięcie centrum
        const wx = c.wobbleAmp * breathR * Math.sin(t * c.wobbleSpeed + c.wobblePhase);
        const wy = c.wobbleAmp * breathR * Math.cos(t * c.wobbleSpeed * 0.7 + c.wobblePhase);

        // Dryf — ledwie wyczuwalny
        c.x += c.vx;
        c.y += c.vy;

        // Miękkie granice — świeca obraca się gdy zbliży do krawędzi
        const margin = breathR * 0.4;
        if (c.x < margin)        c.vx =  Math.abs(c.vx);
        if (c.x > W - margin)    c.vx = -Math.abs(c.vx);
        if (c.y < margin)        c.vy =  Math.abs(c.vy);
        if (c.y > H - margin)    c.vy = -Math.abs(c.vy);

        const cx = c.x + wx;
        const cy = c.y + wy;

        // Oddech opacity — to samo tempo co rozmiar, inne fazy → różne momenty cyklu
        const breathFactor = 0.75 + 0.25 * Math.sin(t * BREATH_SPEED + c.breathPhase);
        const opacity = c.maxOpacity * breathFactor;

        const { r, g, b } = COLORS[c.ci];

        // Miękka poświata: gradient 3-stopniowy — centrum jaśniejsze, krawędź zanika
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, breathR);
        grad.addColorStop(0,    `rgba(${r},${g},${b},${(opacity * 0.9).toFixed(3)})`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${(opacity * 0.55).toFixed(3)})`);
        grad.addColorStop(0.70, `rgba(${r},${g},${b},${(opacity * 0.18).toFixed(3)})`);
        grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, breathR, 0, Math.PI * 2);
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
