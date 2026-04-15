'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Paleta ziaren — 6 kolorów, 3 złote + 3 śnieżnobiałe ───────────────────
// Format: 'rgba(r,g,b,' — domykamy: + alpha.toFixed(2) + ')'
const S = [
  'rgba(212,168,64,',   // złoty
  'rgba(255,255,255,',  // śnieżna biel
  'rgba(196,150,74,',   // ciepły brąz
  'rgba(255,255,255,',  // śnieżna biel
  'rgba(232,188,82,',   // jasny złoty
  'rgba(255,255,255,',  // śnieżna biel
] as const;

// Pre-obliczone stringi fillStyle — 6 kolorów × 32 poziomy opacity.
// Eliminuje alokację stringów w hot loopie i minimalizuje zmiany stanu canvas.
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

// ─── Value noise 1D — bez dependencji ───────────────────────────────────────
function noise1d(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1 + 311.7) * 43758.5453;
  return (a - Math.floor(a)) * (1 - u) + (b - Math.floor(b)) * u;
}

// ─── Typy ────────────────────────────────────────────────────────────────────

// Ziarno w układzie biegunowym — porusza się od środka ekranu na zewnątrz
// symulując efekt głębi (piasek wyłaniający się z perspektywy ku użytkownikowi)
interface Grain {
  angle:      number;  // kąt [0, 2π] — kierunek od środka
  r:          number;  // odległość od środka ekranu (px)
  speed:      number;  // prędkość radialna (px/klatkę) — bardzo mała
  angDrift:   number;  // wolny dryf kątowy (spiralny ruch)
  maxSize:    number;  // rozmiar przy pełnym r (0.4–1.8 px)
  maxOpacity: number;  // opacity przy pełnym r
  ci:         number;  // indeks koloru w S[]
}

// Ziarna opadające z krawędzi elementów (pierwszoplanowa warstwa FG)
interface Faller {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  ci: number;
  life: number;  // 1 → 0
}

// ─── Liczba ziaren wg rozdzielczości ────────────────────────────────────────
function grainCount(w: number): number {
  if (w >= 1280) return 22000;
  if (w >= 1024) return 14000;
  if (w >= 640)  return 6000;
  return 2000;
}

const MAX_PILE    = 8;     // px — maks. wysokość hałdy na krawędzi elementu
const MAX_FALLERS = 2000;  // limit aktywnych opadających ziaren

// ─── Komponent ───────────────────────────────────────────────────────────────
export default function DesertCanvas() {
  const { resolvedTheme } = useTheme();
  const variant = useDesignVariant();
  const [mounted, setMounted] = useState(false);

  const bgRef  = useRef<HTMLCanvasElement>(null);
  const fgRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Montaż po stronie klienta — guard SSR/hydration
  useEffect(() => { setMounted(true); }, []);

  // Guard MUSI być po wszystkich hookach — nie zmienia ich liczby między renderami
  const active = mounted && resolvedTheme !== 'dark' && variant === 'v1';

  useEffect(() => {
    if (!active) return;

    const bgCanvas = bgRef.current!;
    const fgCanvas = fgRef.current!;
    const bgCtx    = bgCanvas.getContext('2d')!;
    const fgCtx    = fgCanvas.getContext('2d')!;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Geometria ekranu + punkt znikania (środek)
    let W = 0, H = 0, CX = 0, CY = 0, MAX_R = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      CX = W / 2;
      CY = H / 2;
      MAX_R = Math.hypot(CX, CY) + 20;  // przekątna od środka do rogu + margines

      for (const c of [bgCanvas, fgCanvas]) {
        c.width        = Math.round(W * dpr);
        c.height       = Math.round(H * dpr);
        c.style.width  = `${W}px`;
        c.style.height = `${H}px`;
      }
      // Reset transformacji — bez tego scale akumuluje się przy kolejnych resize
      bgCtx.setTransform(1, 0, 0, 1, 0, 0); bgCtx.scale(dpr, dpr);
      fgCtx.setTransform(1, 0, 0, 1, 0, 0); fgCtx.scale(dpr, dpr);
    }
    resize();

    // ─── Stan ────────────────────────────────────────────────────────────────
    let grains:    Grain[]        = [];
    let fallers:   Faller[]       = [];
    let edgeRects: DOMRect[]      = [];
    let piles:     Float32Array[] = [];  // piles[ri][xi] = wys. hałdy w kolumnie xi

    function makeGrain(spreadFull: boolean): Grain {
      const tiny = Math.random() < 0.68;
      return {
        angle:      Math.random() * Math.PI * 2,
        r:          spreadFull ? Math.random() * MAX_R : Math.random() * MAX_R * 0.15,
        speed:      0.06 + Math.random() * 0.28,  // bardzo wolny ruch radialny
        angDrift:   (Math.random() - 0.5) * 0.0006,
        maxSize:    tiny ? 0.35 + Math.random() * 0.4 : 0.7 + Math.random() * 1.1,
        maxOpacity: 0.12 + Math.random() * 0.55,
        ci:         Math.floor(Math.random() * S.length),
      };
    }

    function initGrains() {
      if (reducedMotion) { grains = []; return; }
      const N = grainCount(W);
      grains = Array.from({ length: N }, () => makeGrain(true));
      // Sortuj po ci — minimalizuje zmiany fillStyle w hot loopie (6 zmian na 22 000 ziaren)
      grains.sort((a, b) => a.ci - b.ci);
    }
    initGrains();

    // ─── Krawędzie elementów DOM ─────────────────────────────────────────────
    function refreshEdges() {
      const els      = document.querySelectorAll('[data-sand-edge]');
      const newRects = Array.from(els).map(el => el.getBoundingClientRect());
      if (newRects.length !== edgeRects.length) {
        piles = newRects.map(r => new Float32Array(Math.ceil(r.width) + 1));
      }
      edgeRects = newRects;
    }
    refreshEdges();
    window.addEventListener('scroll', refreshEdges, { passive: true });

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

    // ─── Rysowanie hałd piasku na krawędziach elementów ─────────────────────
    function drawPiles() {
      for (let ri = 0; ri < piles.length; ri++) {
        const pile = piles[ri];
        const rect = edgeRects[ri];
        if (!pile || !rect) continue;
        for (let xi = 0; xi < pile.length; xi++) {
          const h = pile[xi];
          if (h < 0.3) continue;
          const ci = (xi * 3 + ri * 7) % S.length;
          bgCtx.fillStyle = COLOR_TABLE[ci][Math.floor(0.82 * OPACITY_LEVELS)];
          bgCtx.fillRect(rect.left + xi, rect.top - h, 1, h + 0.5);
        }
      }
    }

    // ─── Główna pętla ────────────────────────────────────────────────────────
    let edgeFrame = 0;

    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);
      edgeFrame++;
      if (edgeFrame % 90 === 0) refreshEdges();

      // ── BG canvas ─────────────────────────────────────────────────────────
      bgCtx.clearRect(0, 0, W, H);

      // Jasne tło cream — bez wydm, bez ciemnego gradientu
      const bgGrad = bgCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#FDF5F0');
      bgGrad.addColorStop(1, '#FAF0E2');
      bgCtx.fillStyle = bgGrad;
      bgCtx.fillRect(0, 0, W, H);

      if (!reducedMotion) {
        const tSlow = t * 0.000028;

        // ── Hałdy: erozja + spawn fallerów przy przepełnieniu ───────────────
        for (let ri = 0; ri < piles.length; ri++) {
          const pile = piles[ri];
          const rect = edgeRects[ri];
          if (!pile || !rect) continue;
          for (let xi = 0; xi < pile.length; xi++) {
            if (pile[xi] < 0.1) continue;
            pile[xi] *= 0.9994;
            if (pile[xi] > MAX_PILE && fallers.length < MAX_FALLERS) {
              pile[xi] = MAX_PILE;
              const n = 1 + (Math.random() < 0.4 ? 1 : 0);
              for (let k = 0; k < n; k++) {
                fallers.push({
                  x:       rect.left + xi + (Math.random() - 0.5) * 2,
                  y:       rect.top + 0.5,
                  vx:      (Math.random() - 0.5) * 0.6,
                  vy:      0.15 + Math.random() * 0.35,
                  size:    0.2 + Math.random() * 0.5,
                  opacity: 0.5 + Math.random() * 0.4,
                  ci:      Math.floor(Math.random() * S.length),
                  life:    1,
                });
              }
            }
          }
        }

        // ── Fizyka i rendering ziaren ────────────────────────────────────────
        // Ziarna posortowane po ci → fillStyle zmienia się tylko 5-6 razy na frame
        let lastStyle = '';

        for (const g of grains) {
          // Ruch radialny — lekkie przyspieszenie z odległością (perspektywa)
          const t01   = Math.min(g.r / MAX_R, 1.0);
          g.r        += g.speed * (0.55 + t01 * 0.55);
          g.angle    += g.angDrift + noise1d(g.r * 0.015 + g.ci * 3.7 + tSlow) * 0.00025;

          // Reset do centrum gdy wychodzi poza krawędź ekranu
          if (g.r >= MAX_R + 8) {
            g.r     = Math.random() * MAX_R * 0.06;
            g.angle = Math.random() * Math.PI * 2;
            continue;
          }

          // Projekcja biegunowa → ekranowa
          const x = CX + Math.cos(g.angle) * g.r;
          const y = CY + Math.sin(g.angle) * g.r;
          if (x < -2 || x > W + 2 || y < -2 || y > H + 2) continue;

          // Perspektywa: opacity i size rosną kwadratowo z odległością od centrum.
          // Efekt: piasek "wyłania się z głębi" — niewidoczny przy centrum,
          // coraz bardziej widoczny i większy gdy zbliża się do krawędzi ekranu.
          const t01sq  = t01 * t01;
          const opacity = g.maxOpacity * t01sq;
          if (opacity < 0.012) continue;
          const size = g.maxSize * (0.15 + t01 * 0.85);

          // Detekcja krawędzi DOM → akumulacja w hałdzie
          let caught = false;
          for (let ri = 0; ri < edgeRects.length; ri++) {
            const rect = edgeRects[ri];
            if (x >= rect.left - 1 && x <= rect.right + 1 &&
                y >= rect.top - 5  && y <= rect.top + 3) {
              const col = Math.max(0, Math.min(piles[ri].length - 1, Math.floor(x - rect.left)));
              piles[ri][col] = Math.min(piles[ri][col] + size * 1.1, MAX_PILE * 1.6);
              g.r     = Math.random() * MAX_R * 0.06;
              g.angle = Math.random() * Math.PI * 2;
              caught  = true;
              break;
            }
          }
          if (caught) continue;

          // Render — fillRect szybszy niż arc dla sub-pikselowych ziaren.
          // fillStyle setujemy tylko gdy faktycznie się zmienił.
          const style = colorStr(g.ci, opacity);
          if (style !== lastStyle) { bgCtx.fillStyle = style; lastStyle = style; }
          const half = size * 0.5;
          bgCtx.fillRect(x - half, y - half, size, size);
        }

        drawPiles();
      }

      // ── FG canvas — opadający piasek z krawędzi elementów ────────────────
      fgCtx.clearRect(0, 0, W, H);
      if (!reducedMotion) {
        fallers = fallers.filter(f => f.life > 0.01 && f.y < H + 40);

        let lastFgStyle = '';
        for (const f of fallers) {
          f.vy  = Math.min(f.vy + 0.20, 7);
          f.vx += (Math.random() - 0.5) * 0.04;
          f.x  += f.vx;
          f.y  += f.vy;
          f.life *= 0.9935;

          const style = colorStr(f.ci, f.opacity * f.life);
          if (style !== lastFgStyle) { fgCtx.fillStyle = style; lastFgStyle = style; }
          fgCtx.fillRect(f.x, f.y, f.size * 1.6, f.size * 0.9);
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
      {/* BG: jasne tło cream + ziarna piasku z efektem głębi (z-index: -1) */}
      <canvas
        ref={bgRef}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', display: 'block' }}
      />
      {/* FG: opadający piasek z krawędzi elementów (z-index: 49, przed treścią, za headerem z-50) */}
      <canvas
        ref={fgRef}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 49, pointerEvents: 'none', display: 'block' }}
      />
    </>
  );
}
