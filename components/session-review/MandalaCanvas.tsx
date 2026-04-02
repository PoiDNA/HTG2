'use client';

// ---------------------------------------------------------------------------
// MandalaCanvas — the ONLY steady requestAnimationFrame in the player
//
// Renders: pattern → vignette → watermark (with halo).
// Manages: DPR clamping, frame budget degradation, pause/visibility/reduced-motion.
// Analysis graph optional — falls back to ambient animations.
// ---------------------------------------------------------------------------

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { AudioSampler, type AnalysisState } from './audioSampler';
import { drawWatermark } from './drawWatermark';
import { lotusPattern } from './patterns/lotus';
import { concentricCirclesPattern } from './patterns/concentric-circles';
import { SILENT_BANDS, type AudioBands, type Pattern, type RenderContext } from './patterns/types';
import type { AudioEngineHandle } from './AudioEngine';

export interface MandalaCanvasHandle {
  triggerBurst: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DPR = 1.5;
const FRAME_BUDGET_WARN = 12;  // ms — start reducing complexity
const FRAME_BUDGET_HARD = 14;  // ms — disable glow/vignette
const FRAME_AVG_WINDOW = 10;   // frames for rolling average
const BG_COLOR = '#0D1A12';

// Dev benchmark flag (build-time)
const DEV_BENCHMARK = typeof process !== 'undefined'
  && process.env.NEXT_PUBLIC_DEV_BENCHMARK === '1';

type CanvasAnalysisState = 'reactive' | 'analysis-unavailable' | 'ambient-fallback';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MandalaCanvasProps {
  engineHandle: AudioEngineHandle | null;
  userEmail: string;
  userId: string;
  isPlaying: boolean;
  isActive: boolean;        // true whenever canvas is visible (always animate)
  motionMode: 'full' | 'reduced';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MandalaCanvas = forwardRef<MandalaCanvasHandle, MandalaCanvasProps>(function MandalaCanvas({
  engineHandle,
  userEmail,
  userId,
  isPlaying,
  isActive,
  motionMode,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const samplerRef = useRef<AudioSampler | null>(null);
  const startTimeRef = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const degradationLevel = useRef(0); // 0=full, 1=reduced layers, 2=no glow
  const analysisState = useRef<CanvasAnalysisState>('analysis-unavailable');
  const lastFrameRef = useRef<ImageData | null>(null);
  const interactionBurstRef = useRef(0);       // 0-1 decaying burst from flower click
  const interactionBurstTimeRef = useRef(0);   // timestamp of last burst

  // Expose triggerBurst so parent can call it (e.g. from click on flower area)
  useImperativeHandle(ref, () => ({
    triggerBurst: () => {
      interactionBurstRef.current = 1;
      interactionBurstTimeRef.current = performance.now();
    },
  }), []);

  // Select active pattern
  const pattern: Pattern = DEV_BENCHMARK ? concentricCirclesPattern : lotusPattern;

  const digits = userId.replace(/\D/g, '').slice(0, 8);
  const watermarkText = `HTG | ${userEmail} | ${digits}`;

  // -------------------------------------------------------------------------
  // Resize handler (also used for single redraw on pause)
  // -------------------------------------------------------------------------
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }, []);

  // -------------------------------------------------------------------------
  // Single static frame (for pause, reduced-motion, resize)
  // -------------------------------------------------------------------------
  const drawStaticFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    sizeCanvas();

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Static pattern render
    const renderCtx: RenderContext = {
      ctx,
      width,
      height,
      time: 0,
      audioTime: engineHandle?.getSnapshot().currentTime ?? 0,
      audio: SILENT_BANDS,
      dpr,
      interactionBurst: 0,
    };
    pattern.render(renderCtx);

    // Watermark
    drawWatermark(ctx, width, height, watermarkText);

    ctx.restore();
  }, [sizeCanvas, pattern, watermarkText, engineHandle]);

  // -------------------------------------------------------------------------
  // Animation loop
  // -------------------------------------------------------------------------
  // Track isPlaying in a ref so the rAF loop can read the latest value
  // without restarting the entire animation loop on play/pause transitions.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!isActive || motionMode === 'reduced') {
      // Draw one static frame and stop
      drawStaticFrame();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();

    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      // Frame timing for degradation
      const frameDelta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      frameTimes.current.push(frameDelta);
      if (frameTimes.current.length > FRAME_AVG_WINDOW) {
        frameTimes.current.shift();
      }
      const avgFrame = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;

      // Update degradation level
      if (avgFrame > FRAME_BUDGET_HARD) {
        degradationLevel.current = 2;
      } else if (avgFrame > FRAME_BUDGET_WARN) {
        degradationLevel.current = 1;
      }
      // Don't recover degradation level (sticky for this session)

      // Canvas sizing
      sizeCanvas();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Sample audio only when playing
      let audio: AudioBands = SILENT_BANDS;
      const currentlyPlaying = isPlayingRef.current;

      if (currentlyPlaying) {
        // Try to create sampler if analyser available (only while playing)
        const analyser = engineHandle?.getAnalyser();
        if (analyser && !samplerRef.current) {
          samplerRef.current = new AudioSampler(analyser);
          analysisState.current = 'reactive';
        }

        if (samplerRef.current) {
          audio = samplerRef.current.sample();
          if (samplerRef.current.state === 'ambient-fallback') {
            analysisState.current = 'ambient-fallback';
          }
        }
      }

      // Ambient time-based fallback: before play, after ended, or no reactive data
      if (!currentlyPlaying || analysisState.current !== 'reactive') {
        const t = (timestamp - startTimeRef.current) / 1000;
        audio = {
          energy: 0.15 + 0.1 * Math.sin(t * 0.3),
          midEnergy: 0.1 + 0.08 * Math.sin(t * 0.5 + 1),
          highEnergy: 0.05 + 0.05 * Math.sin(t * 0.7 + 2),
          totalEnergy: 0.1 + 0.08 * Math.sin(t * 0.4),
          isSilent: false,
        };
      }

      const time = (timestamp - startTimeRef.current) / 1000;
      const audioTime = engineHandle?.getSnapshot().currentTime ?? 0;

      // Compute interaction burst (decays over ~0.8s with ease-out)
      let interactionBurst = 0;
      if (interactionBurstRef.current > 0) {
        const elapsed = (timestamp - interactionBurstTimeRef.current) / 800;
        interactionBurst = Math.max(0, 1 - elapsed * elapsed); // quadratic ease-out
        if (interactionBurst <= 0) interactionBurstRef.current = 0;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      // 2. Pattern
      const renderCtx: RenderContext = {
        ctx, width, height, time, audioTime, audio, dpr, interactionBurst,
      };
      pattern.render(renderCtx);

      // 3. Vignette (skip at degradation level 2)
      if (degradationLevel.current < 2) {
        const vignette = ctx.createRadialGradient(
          width / 2, height / 2, width * 0.25,
          width / 2, height / 2, width * 0.55,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
      }

      // 4. Watermark
      drawWatermark(ctx, width, height, watermarkText);

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, motionMode, engineHandle, sizeCanvas, pattern, watermarkText, drawStaticFrame]);

  // -------------------------------------------------------------------------
  // Visibility change — stop rAF when tab is hidden
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      }
      // rAF will restart from the isPlaying effect when tab becomes visible
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // -------------------------------------------------------------------------
  // Resize on pause — single redraw
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isActive && motionMode !== 'reduced') return; // rAF handles resize when active

    const onResize = () => drawStaticFrame();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isActive, motionMode, drawStaticFrame]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  );
});

export default MandalaCanvas;
