'use client';

// DesertCanvas — Wariant A1: "Rozpad iluzji" (dissolution)
// Ziarna z zewnątrz → centrum. Forma (złoto) rozpuszcza się w pustkę (biel/fiolet).
// Spiralny wir, medytacyjne tempo, brak akumulacji.

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Paleta — rozpad iluzji na poziomie energetycznym ────────────────────────
// Zewnątrz (forma/ciepło) → centrum (pustka/eter)
// Złoto i bursztyn = świat formy → blady fiolet i biel = rozproszenie w eter
const S = [
  'rgba(212,168,64,',   // złoty — materia, forma, ciepło
  'rgba(196,140,80,',   // bursztyn — ostatni ślad fizyczności
  'rgba(180,130,200,',  // blady fiolet — subtelna energia
  'rgba(160,170,230,',  // błękitno-liliowy — rozproszenie
  'rgba(210,190,255,',  // prawie biały liliowy — granica pustki
  'rgba(230,220,255,',  // eteryczna biel — czysty potencjał
] as const;

// Pre-obliczone stringi fillStyle — 6 kolorów × 32 poziomy opacity.
const OPACITY_LEVELS = 32;
const COLOR_TABLE: string[][] = (S as readonly string[]).map(c =>
  Array.from({ length: OPACITY_LEVELS }, (_, i) =>
    c + ((i + 1) / OPACITY_LEVELS).toFixed(2) + ')'
  )
);

function colorStr(ci: number, opacity: number): string {
  const idx = Math.max(0, Math.min(OPACITY_LEVELS - 1, Math.floor(opacity * OPACITY_LEVELS)));
  return COLOR_TABLE[ci][idx];
}

// ─── Value noise 1D ──────────────────────────────────────────────────────────
function noise1d(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1 + 311.7) * 43758.5453;
  return (a - Math.floor(a)) * (1 - u) + (b - Math.floor(b)) * u;
}

// ─── Typ ziarna ───────────────────────────────────────────────────────────────
// Ziarno porusza się Z ZEWNĄTRZ DO CENTRUM — rozpad formy w pustkę
interface Grain {
  angle:      number;  // kąt [0, 2π]
  r:          number;  // odległość od centrum (maleje — wciągana do środka)
  speed:      number;  // prędkość radialna (px/klatkę) — medytacyjna
  angDrift:   number;  // dryf kątowy — spiralny wir wciągający
  maxSize:    number;  // rozmiar przy krawędzi ekranu
  maxOpacity: number;  // opacity przy krawędzi
  ci:         number;  // indeks koloru — ziarna cieplejsze vs. eteryczne
}

// ─── Liczba ziaren wg rozdzielczości ────────────────────────────────────────
function grainCount(w: number): number {
  if (w >= 1280) return 22000;
  if (w >= 1024) return 14000;
  if (w >= 640)  return 6000;
  return 2000;
}

// ─── Komponent ───────────────────────────────────────────────────────────────
export default function DesertCanvas() {
  const { resolvedTheme } = useTheme();
  const variant = useDesignVariant();
  const [mounted, setMounted] = useState(false);

  const bgRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => { setMounted(true); }, []);

  const active = mounted && resolvedTheme !== 'dark' && variant === 'v1';

  useEffect(() => {
    if (!active) return;

    const bgCanvas = bgRef.current!;
    const bgCtx    = bgCanvas.getContext('2d')!;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let W = 0, H = 0, CX = 0, CY = 0, MAX_R = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      CX = W / 2;
      CY = H / 2;
      MAX_R = Math.hypot(CX, CY) + 20;

      bgCanvas.width        = Math.round(W * dpr);
      bgCanvas.height       = Math.round(H * dpr);
      bgCanvas.style.width  = `${W}px`;
      bgCanvas.style.height = `${H}px`;

      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx.scale(dpr, dpr);
    }
    resize();

    let grains: Grain[] = [];

    function makeGrain(spreadFull: boolean): Grain {
      // Ciepłe kolory (złoto/bursztyn) dla ziaren zewnętrznych — "forma"
      // Eteryczne kolory (fiolet/biel) dla ziaren bliskich centrum — "pustka"
      // Proporcja: 40% ciepłe, 60% eteryczne — w połowie drogi do rozpadu
      const warm = Math.random() < 0.40;
      const ci = warm
        ? Math.floor(Math.random() * 2)        // 0–1: złoty, bursztyn
        : 2 + Math.floor(Math.random() * 4);   // 2–5: fiolet → biel

      return {
        angle:      Math.random() * Math.PI * 2,
        // Ziarna startują przy krawędzi — wciągane do centrum
        r:          spreadFull
                      ? MAX_R * (0.15 + Math.random() * 0.85)
                      : MAX_R * (0.70 + Math.random() * 0.30),
        // Medytacyjnie wolny ruch
        speed:      0.03 + Math.random() * 0.12,
        // Silna spirala — wir pochłaniający
        // Większość kręci w tę samą stronę = efekt wiru
        angDrift:   (Math.random() < 0.75 ? 1 : -1) * (0.0008 + Math.random() * 0.002),
        maxSize:    warm
                      ? 1.8 + Math.random() * 1.8   // większe przy krawędzi (forma)
                      : 0.8 + Math.random() * 1.2,  // mniejsze eteryczne
        maxOpacity: warm
                      ? 0.55 + Math.random() * 0.35  // wyraźne złoto
                      : 0.35 + Math.random() * 0.45, // delikatny eter
        ci,
      };
    }

    function initGrains() {
      if (reducedMotion) { grains = []; return; }
      const N = grainCount(W);
      grains = Array.from({ length: N }, () => makeGrain(true));
      grains.sort((a, b) => a.ci - b.ci);
    }
    initGrains();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); initGrains(); }, 200);
    });
    ro.observe(document.documentElement);

    // ─── Główna pętla ────────────────────────────────────────────────────────
    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);

      bgCtx.clearRect(0, 0, W, H);
      if (!reducedMotion) {
        const tSlow = t * 0.000018;  // wolniejszy szum niż poprzednio

        let lastStyle = '';

        for (const g of grains) {
          // t01: 1.0 przy krawędzi, 0.0 przy centrum — reprezentuje "ilość formy"
          const t01 = Math.min(g.r / MAX_R, 1.0);

          // Ruch do centrum — lekko przyspiesza przy zbliżaniu (grawitacja pustki)
          g.r -= g.speed * (0.5 + (1.0 - t01) * 0.5);

          // Spiralny dryf — wir pochłaniający
          g.angle += g.angDrift + noise1d(g.r * 0.012 + g.ci * 2.3 + tSlow) * 0.0002;

          // Odrodzenie przy krawędzi gdy ziarno dotrze do centrum
          if (g.r <= 1.5) {
            g.r     = MAX_R * (0.85 + Math.random() * 0.15);
            g.angle = Math.random() * Math.PI * 2;
            continue;
          }

          // Projekcja biegunowa → ekranowa
          const x = CX + Math.cos(g.angle) * g.r;
          const y = CY + Math.sin(g.angle) * g.r;
          if (x < -2 || x > W + 2 || y < -2 || y > H + 2) continue;

          // Opacity maleje w kierunku centrum — rozpuszczanie formy
          // Ciepłe ziarna (ci 0–1) bardziej wyraźne przy krawędzi
          // Eteryczne (ci 2–5) subtelniejsze przez całą drogę
          const opacity = g.maxOpacity * t01;
          if (opacity < 0.03) continue;

          // Rozmiar maleje w kierunku centrum — materia rozrzedza się
          const size = g.maxSize * (0.1 + t01 * 0.9);

          const style = colorStr(g.ci, opacity);
          if (style !== lastStyle) { bgCtx.fillStyle = style; lastStyle = style; }
          const half = size * 0.5;
          bgCtx.fillRect(x - half, y - half, size, size);
        }
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
    // Jeden canvas — brak FG (rozpad nie osiada, nie opada)
    <canvas
      ref={bgRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', display: 'block' }}
    />
  );
}
