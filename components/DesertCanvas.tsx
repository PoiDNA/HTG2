'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useDesignVariant } from '@/lib/design-variant-context';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  sky0:    '#FDF5F0', // niebo — cream
  sky1:    '#F8EAD8', // horyzont — ciepły
  sand0:   '#F4D4A0', // jasny piasek
  sand1:   '#E8B87A', // piasek w cieniu
  dune0:   '#D4A840', // złoty szczyt (--color-htg-warm)
  dune1:   '#C4964A', // ciemna wydma
  particle:'#D4A840', // cząsteczki wiatru
} as const;

// ─── Prosta funkcja noise 1D (bez dependencji) ────────────────────────────────
function noise1d(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1 + 311.7) * 43758.5453;
  return (a - Math.floor(a)) * (1 - u) + (b - Math.floor(b)) * u;
}

// ─── Typy ─────────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  depth: number;        // 0 = daleki, 1 = bliski
  accumulated: boolean;
}

interface Faller {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  life: number;          // 0–1, zmniejsza się
}

// ─── Konfiguracja cząsteczek wg breakpointu ───────────────────────────────────
function getParticleCount(w: number): number {
  if (w >= 1024) return 600;
  if (w >= 640)  return 350;
  return 150;
}

// ─── Dune seed — deterministyczny ────────────────────────────────────────────
const DUNE_SEEDS = [0.3, 0.55, 0.72, 0.88]; // % viewportu X — bazowe pozycje wydm
const DUNE_AMPS  = [0.35, 0.28, 0.22, 0.18]; // amplitudy (jako % wys. viewportu)

export default function DesertCanvas() {
  const { resolvedTheme } = useTheme();
  const variant = useDesignVariant();

  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Nie renderuj w dark mode ani poza V1
  if (resolvedTheme === 'dark' || variant !== 'v1') return null;

  useEffect(() => {
    const bgCanvas = bgRef.current;
    const fgCanvas = fgRef.current;
    if (!bgCanvas || !fgCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');
    if (!bgCtx || !fgCtx) return;

    // ─── Sprawdź reduced motion ─────────────────────────────────────────────
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ─── Inicjalizacja rozmiarów canvas ────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      for (const c of [bgCanvas!, fgCanvas!]) {
        c.width  = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        c.style.width  = `${W}px`;
        c.style.height = `${H}px`;
      }
      bgCtx!.scale(dpr, dpr);
      fgCtx!.scale(dpr, dpr);
    }
    resize();

    // ─── Pool cząsteczek ───────────────────────────────────────────────────
    let particles: Particle[] = [];
    let fallers: Faller[] = [];

    function initParticles() {
      const count = reducedMotion ? 0 : getParticleCount(W);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0.5 + Math.random() * 0.8,
        vy: (Math.random() - 0.5) * 0.3,
        size: 0.8 + Math.random() * 2.2,
        opacity: 0.2 + Math.random() * 0.5,
        depth: Math.random(),
        accumulated: false,
      }));
    }
    initParticles();

    // ─── Resize z debounce ──────────────────────────────────────────────────
    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        initParticles();
      }, 200);
    });
    ro.observe(document.documentElement);

    // ─── Krawędzie elementów DOM ───────────────────────────────────────────
    let edgeRects: DOMRect[] = [];
    let edgeFrame = 0;

    function refreshEdges() {
      const els = document.querySelectorAll('[data-sand-edge]');
      edgeRects = Array.from(els).map(el => el.getBoundingClientRect());
    }

    // ─── Rysowanie wydm ────────────────────────────────────────────────────
    function drawDunes(t: number) {
      const duneH = H * (W >= 1024 ? 0.35 : W >= 640 ? 0.25 : 0.18);

      for (let di = DUNE_SEEDS.length - 1; di >= 0; di--) {
        const amp   = DUNE_AMPS[di] * H;
        const phase = t * 0.00004 * (1 + di * 0.3); // bardzo wolno
        const baseY = H - duneH * (0.5 + di * 0.15);

        const grad = bgCtx!.createLinearGradient(0, baseY - amp, 0, H);
        grad.addColorStop(0, di === 0 ? C.dune0 : di === 1 ? C.dune1 : C.sand1);
        grad.addColorStop(0.4, C.sand1);
        grad.addColorStop(1, C.sand0);

        bgCtx!.beginPath();
        bgCtx!.moveTo(0, H);

        // Krzywe Béziera dla płynnego kształtu wydmy
        const steps = 6;
        for (let s = 0; s <= steps; s++) {
          const px = (s / steps) * W;
          const wave = Math.sin(px / W * Math.PI * 2 + phase + di) * amp * 0.5
                     + Math.sin(px / W * Math.PI * 3 + phase * 1.3 + di * 2) * amp * 0.3;
          const noiseVal = noise1d(px / W * 4 + di * 10 + phase * 0.5) * amp * 0.25;
          const py = baseY + wave + noiseVal;

          if (s === 0) {
            bgCtx!.lineTo(px, py);
          } else {
            const prevPx = ((s - 1) / steps) * W;
            const prevWave = Math.sin(prevPx / W * Math.PI * 2 + phase + di) * amp * 0.5
                           + Math.sin(prevPx / W * Math.PI * 3 + phase * 1.3 + di * 2) * amp * 0.3;
            const prevNoise = noise1d(prevPx / W * 4 + di * 10 + phase * 0.5) * amp * 0.25;
            const prevPy = baseY + prevWave + prevNoise;
            const cpx = (prevPx + px) / 2;
            bgCtx!.bezierCurveTo(cpx, prevPy, cpx, py, px, py);
          }
        }

        bgCtx!.lineTo(W, H);
        bgCtx!.closePath();
        bgCtx!.fillStyle = grad;
        bgCtx!.fill();
      }
    }

    // ─── Główna pętla animacji ─────────────────────────────────────────────
    let lastEdgeCheck = 0;

    function frame(t: number) {
      rafRef.current = requestAnimationFrame(frame);

      // Odświeżenie krawędzi co 90 klatek (~1.5s)
      edgeFrame++;
      if (edgeFrame % 90 === 0) {
        refreshEdges();
        lastEdgeCheck = t;
      }

      // ── BG canvas ──────────────────────────────────────────────────────
      bgCtx!.clearRect(0, 0, W, H);

      // Gradient nieba
      const skyGrad = bgCtx!.createLinearGradient(0, 0, 0, H * 0.45);
      skyGrad.addColorStop(0, C.sky0);
      skyGrad.addColorStop(1, C.sky1);
      bgCtx!.fillStyle = skyGrad;
      bgCtx!.fillRect(0, 0, W, H);

      // Wydmy
      drawDunes(t);

      // Piasek wietrzny
      if (!reducedMotion) {
        const windX = 0.8 + Math.sin(t / 4000) * 0.3;

        for (const p of particles) {
          if (p.accumulated) continue;

          // Ruch
          const noiseVal = noise1d(p.x / 80 + t / 3000);
          p.vx = windX + noiseVal * 0.15;
          p.vy = Math.sin(noiseVal * Math.PI * 2) * 0.2;
          p.x += p.vx * (0.6 + p.depth * 0.6);
          p.y += p.vy;

          // Wrap-around
          if (p.x > W + 10) { p.x = -10; p.y = Math.random() * H; p.accumulated = false; }
          if (p.y < 0)  p.y = H;
          if (p.y > H)  p.y = 0;

          // Detekcja krawędzi
          for (const rect of edgeRects) {
            if (
              p.x >= rect.left && p.x <= rect.right &&
              p.y >= rect.top - 6 && p.y <= rect.top + 6
            ) {
              p.accumulated = true;
              p.y = rect.top - p.size / 2;
              p.vx = 0; p.vy = 0;

              // Gęstość akumulacji — co 4px może być 1 cząsteczka
              const density = particles.filter(
                q => q.accumulated && Math.abs(q.y - p.y) < 3 && Math.abs(q.x - p.x) < 4
              ).length;
              if (density > 2) {
                // Overflow → spada jako faller
                p.accumulated = false;
                p.x = -20; // teleport za ekran → reset
                fallers.push({
                  x: p.x, y: rect.top,
                  vx: (Math.random() - 0.5) * 0.8,
                  vy: 0.5 + Math.random() * 0.5,
                  size: 1.5 + Math.random() * 2.5,
                  opacity: 0.5 + Math.random() * 0.4,
                  life: 1,
                });
              }
              break;
            }
          }

          // Rysowanie cząsteczki BG
          bgCtx!.beginPath();
          bgCtx!.arc(p.x, p.y, p.size * (0.5 + p.depth * 0.5), 0, Math.PI * 2);
          bgCtx!.fillStyle = `rgba(212,168,64,${p.opacity * (0.3 + p.depth * 0.7)})`;
          bgCtx!.fill();
        }

        // Rysowanie zakumulowanego piasku
        for (const p of particles) {
          if (!p.accumulated) continue;
          // Powoli dryfuje dalej
          p.x += 0.05 + Math.sin(t / 3000 + p.y) * 0.02;
          if (p.x > W + 5) { p.accumulated = false; p.x = -5; }

          bgCtx!.beginPath();
          bgCtx!.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
          bgCtx!.fillStyle = `rgba(196,150,74,${p.opacity * 0.9})`;
          bgCtx!.fill();
        }
      }

      // ── FG canvas (opadający piasek) ───────────────────────────────────
      fgCtx!.clearRect(0, 0, W, H);

      if (!reducedMotion) {
        fallers = fallers.filter(f => f.life > 0.02 && f.y < H + 20);

        for (const f of fallers) {
          f.vy += 0.12; // grawitacja
          f.vx += Math.sin(t / 2000 + f.x / 50) * 0.04;
          f.x += f.vx;
          f.y += f.vy;
          f.life *= 0.994;

          fgCtx!.beginPath();
          fgCtx!.arc(f.x, f.y, f.size, 0, Math.PI * 2);
          fgCtx!.fillStyle = `rgba(212,168,64,${f.opacity * f.life})`;
          fgCtx!.fill();
        }
      }
    }

    // Pierwsze odświeżenie krawędzi
    refreshEdges();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearTimeout(resizeTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, variant]);

  return (
    <>
      {/* Warstwa tła: wydmy + piasek wietrzny (z-index: -1) */}
      <canvas
        ref={bgRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
      {/* Warstwa pierwszoplanowa: opadający piasek (z-index: 49, przed treścią, za headerem) */}
      <canvas
        ref={fgRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 49,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </>
  );
}
