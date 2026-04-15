'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Paleta piasku — 6 odcieni dla głębi ────────────────────────────────────
// Format: prefiks rgba bez zamknięcia — domykamy przez dodanie opacity + ')'
const S = [
  'rgba(212,168,64,',   // złoty główny
  'rgba(196,150,74,',   // ciepły brąz
  'rgba(232,188,82,',   // jasny złoty
  'rgba(178,136,52,',   // ciemny piasek
  'rgba(220,172,68,',   // neutralny
  'rgba(244,204,108,',  // kremowy
] as const;

const BG = {
  bg0: '#FDF5F0',  // cream — góra
  bg1: '#FAF0E2',  // ciepły biały — dół
} as const;

// ─── Value noise 1D (bez dependencji) ───────────────────────────────────────
function noise1d(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1 + 311.7) * 43758.5453;
  return (a - Math.floor(a)) * (1 - u) + (b - Math.floor(b)) * u;
}

// ─── Ziarna wiatru ───────────────────────────────────────────────────────────
interface Grain {
  x: number; y: number;
  vx: number; vy: number;
  size: number;    // 0.25–1.2 px
  opacity: number;
  depth: number;   // 0 = daleki, 1 = bliski — wpływa na prędkość i rozmiar
  ci: number;      // indeks koloru w S[]
}

// ─── Opadające ziarna (FG layer) ─────────────────────────────────────────────
interface Faller {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  ci: number;
  life: number;  // 1→0
}

function grainCount(w: number): number {
  if (w >= 1280) return 2800;
  if (w >= 1024) return 2000;
  if (w >= 640)  return 900;
  return 320;
}

const MAX_PILE = 9;    // px — maks. wysokość hałdy na krawędzi
const MAX_FALLERS = 2500;

// ─── Komponent ───────────────────────────────────────────────────────────────
export default function DesertCanvas() {
  const { resolvedTheme } = useTheme();
  const variant = useDesignVariant();
  const [mounted, setMounted] = useState(false);

  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Montaż po stronie klienta — guard SSR
  useEffect(() => { setMounted(true); }, []);

  // Wszystkie hooki MUSZĄ być przed warunkowym returnem
  const active = mounted && resolvedTheme !== 'dark' && variant === 'v1';

  useEffect(() => {
    if (!active) return;

    const bgCanvas = bgRef.current!;
    const fgCanvas = fgRef.current!;
    const bgCtx = bgCanvas.getContext('2d')!;
    const fgCtx = fgCanvas.getContext('2d')!;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      for (const c of [bgCanvas, fgCanvas]) {
        c.width  = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        c.style.width  = `${W}px`;
        c.style.height = `${H}px`;
      }
      // Reset transformacji — bez tego scale akumuluje się przy kolejnych resize
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      fgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx.scale(dpr, dpr);
      fgCtx.scale(dpr, dpr);
    }
    resize();

    // ─── Stan ziaren i hałd ──────────────────────────────────────────────────
    let grains: Grain[] = [];
    let fallers: Faller[] = [];
    let edgeRects: DOMRect[] = [];
    // piles[ri][xi] = wysokość hałdy w kolumnie xi elementu ri (w px)
    let piles: Float32Array[] = [];

    function makeGrain(): Grain {
      const tiny = Math.random() < 0.72;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 1.4 + Math.random() * 2.0,
        vy: (Math.random() - 0.5) * 0.5,
        size: tiny ? 0.2 + Math.random() * 0.35 : 0.55 + Math.random() * 0.65,
        opacity: 0.18 + Math.random() * 0.62,
        depth: Math.random(),
        ci: Math.floor(Math.random() * S.length),
      };
    }

    function initGrains() {
      const N = reducedMotion ? 0 : grainCount(W);
      grains = Array.from({ length: N }, makeGrain);
    }
    initGrains();

    // ─── Odświeżenie krawędzi DOM ────────────────────────────────────────────
    function refreshEdges() {
      const els = document.querySelectorAll('[data-sand-edge]');
      const newRects = Array.from(els).map(el => el.getBoundingClientRect());

      // Zachowaj istniejące hałdy jeśli liczba elementów się nie zmieniła
      if (newRects.length !== edgeRects.length) {
        piles = newRects.map(r => new Float32Array(Math.ceil(r.width) + 1));
      }
      edgeRects = newRects;
    }
    refreshEdges();

    // Odśwież przy scroll (canvas fixed, rects w koordynatach viewport)
    window.addEventListener('scroll', refreshEdges, { passive: true });

    // ─── Resize + debounce ───────────────────────────────────────────────────
    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        initGrains();
        refreshEdges();
      }, 200);
    });
    ro.observe(document.documentElement);

    // ─── Rysowanie hałd na krawędziach elementów ─────────────────────────────
    function drawPiles() {
      for (let ri = 0; ri < piles.length; ri++) {
        const pile = piles[ri];
        const rect = edgeRects[ri];
        if (!pile || !rect) continue;
        for (let xi = 0; xi < pile.length; xi++) {
          const h = pile[xi];
          if (h < 0.3) continue;
          const x = rect.left + xi;
          // Kolor — nieregularny hash kolumny dla naturalnego wyglądu
          const ci = (xi * 3 + ri * 7) % S.length;
          // Słupek hałdy (od rect.top w górę)
          bgCtx.fillStyle = S[ci] + '0.82)';
          bgCtx.fillRect(x, rect.top - h, 1, h + 0.5);
        }
      }
    }

    // ─── Główna pętla ────────────────────────────────────────────────────────
    let edgeFrame = 0;

    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);
      edgeFrame++;
      if (edgeFrame % 90 === 0) refreshEdges();

      // ── BG canvas ────────────────────────────────────────────────────────
      bgCtx.clearRect(0, 0, W, H);

      // Jasne jednolite tło — delikatny gradient cream bez wydm
      const bgGrad = bgCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, BG.bg0);
      bgGrad.addColorStop(1, BG.bg1);
      bgCtx.fillStyle = bgGrad;
      bgCtx.fillRect(0, 0, W, H);

      if (!reducedMotion) {
        const windX = 2.0 + Math.sin(t / 4800) * 0.55 + Math.sin(t / 1100) * 0.18;

        // ── Aktualizacja hałd i generowanie fallerów ─────────────────────
        for (let ri = 0; ri < piles.length; ri++) {
          const pile = piles[ri];
          const rect = edgeRects[ri];
          if (!pile || !rect) continue;
          for (let xi = 0; xi < pile.length; xi++) {
            if (pile[xi] < 0.1) continue;
            // Wolna erozja — piasek powoli ucieka z wiatrem
            pile[xi] *= 0.9992;
            // Przekroczenie maks. → faller (opadający piasek)
            if (pile[xi] > MAX_PILE && fallers.length < MAX_FALLERS) {
              pile[xi] = MAX_PILE;
              const n = 1 + Math.floor(Math.random() * 3); // 1-3 ziarna naraz
              for (let k = 0; k < n; k++) {
                fallers.push({
                  x: rect.left + xi + (Math.random() - 0.5) * 3,
                  y: rect.top + 0.5,
                  vx: (Math.random() - 0.5) * 1.2 + windX * 0.12,
                  vy: 0.3 + Math.random() * 0.5,
                  size: 0.2 + Math.random() * 0.55,
                  opacity: 0.55 + Math.random() * 0.4,
                  ci: Math.floor(Math.random() * S.length),
                  life: 1,
                });
              }
            }
          }
        }

        // ── Fizyka i rendering ziaren wietrznych ─────────────────────────
        for (const g of grains) {
          const nv = noise1d(g.x / 55 + t / 2200 + g.depth * 3.7);
          g.vx  = windX * (0.45 + g.depth * 0.75) + nv * 0.28;
          g.vy += (Math.sin(nv * Math.PI * 2) * 0.18 - g.vy) * 0.12;
          g.x  += g.vx;
          g.y  += g.vy;

          // Wrap-around
          if (g.x > W + 6)  { g.x = -6; g.y = Math.random() * H; }
          if (g.y < -2)     g.y = H + 2;
          if (g.y > H + 2)  g.y = -2;

          // Detekcja zderzenia z krawędzią elementu → akumulacja w hałdzie
          for (let ri = 0; ri < edgeRects.length; ri++) {
            const r = edgeRects[ri];
            if (g.x >= r.left - 1 && g.x <= r.right + 1 &&
                g.y >= r.top - 5  && g.y <= r.top + 3) {
              const col = Math.max(0, Math.min(piles[ri].length - 1, Math.floor(g.x - r.left)));
              piles[ri][col] = Math.min(piles[ri][col] + g.size * 1.4, MAX_PILE * 1.6);
              // Ziarno zresetowane — wraca z lewej strony
              g.x = -8 - Math.random() * 30;
              g.y = Math.random() * H;
              break;
            }
          }

          // Render — fillRect jest szybszy niż arc dla sub-pikselowych ziaren
          const r = g.size * (0.38 + g.depth * 0.62);
          const alpha = (g.opacity * (0.22 + g.depth * 0.78)).toFixed(2);
          bgCtx.fillStyle = S[g.ci] + alpha + ')';
          bgCtx.fillRect(g.x - r, g.y - r, r * 2 + 0.5, r * 2 + 0.5);
        }

        // Hałdy — po ziarnach, żeby były na wierzchu BG
        drawPiles();
      }

      // ── FG canvas — opadający piasek z krawędzi ───────────────────────────
      fgCtx.clearRect(0, 0, W, H);
      if (!reducedMotion) {
        const windX = 2.0 + Math.sin(t / 4800) * 0.55;
        fallers = fallers.filter(f => f.life > 0.012 && f.y < H + 40);

        for (const f of fallers) {
          // Grawitacja + wiatr + lekki sinusoidalny dryf
          f.vy  = Math.min(f.vy + 0.28, 9);
          f.vx += Math.sin(t / 1400 + f.x / 38) * 0.05 + windX * 0.006;
          f.x  += f.vx;
          f.y  += f.vy;
          f.life *= 0.9905;

          const alpha = (f.opacity * f.life).toFixed(2);
          fgCtx.fillStyle = S[f.ci] + alpha + ')';
          // Podłużny kształt — nieco szerszy niż wysoki (piasek w locie)
          fgCtx.fillRect(f.x, f.y, f.size * 1.8, f.size * 0.9);
        }
      }
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearTimeout(resizeTimer);
      window.removeEventListener('scroll', refreshEdges);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* BG: niebo, wydmy, ziarna wiatru, hałdy (z-index: -1) */}
      <canvas
        ref={bgRef}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', display: 'block' }}
      />
      {/* FG: opadający piasek z krawędzi (z-index: 49 — przed treścią, za headerem z-50) */}
      <canvas
        ref={fgRef}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 49, pointerEvents: 'none', display: 'block' }}
      />
    </>
  );
}
