'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { Participant } from 'livekit-client';
import { MicOff } from 'lucide-react';

// ─── VoiceWaveform — filled envelope with internal oscillation ────────────────
//
// Visual style: symmetric filled waveform (like the reference audio editor image).
// For each x pixel: |sample(x)| determines the half-height of the filled bar.
// The harmonic synthesis creates "teeth" (oscillation detail) inside the fill.
// The overall amplitude pulses at syllable rate (~3 Hz) when speaking.
// Phase scrolls leftward so the live waveform appears active.
// ─────────────────────────────────────────────────────────────────────────────

// Harmonic weights ≈ voice spectrum (dominant fundamental, 6 dB/oct rolloff)
const HARMONICS = [
  { mult: 1.0, weight: 1.00, phaseOff: 0.00 },
  { mult: 2.0, weight: 0.58, phaseOff: 1.10 },
  { mult: 3.0, weight: 0.36, phaseOff: 2.30 },
  { mult: 4.0, weight: 0.22, phaseOff: 0.70 },
  { mult: 5.0, weight: 0.14, phaseOff: 3.50 },
  { mult: 7.0, weight: 0.09, phaseOff: 1.80 },
];
const H_SUM = HARMONICS.reduce((s, h) => s + h.weight, 0);

// Compute harmonic sample at a given phase
function hSample(phase: number): number {
  let s = 0;
  for (const h of HARMONICS) {
    s += Math.sin(phase * h.mult + h.phaseOff) * h.weight;
  }
  return s / H_SUM; // −1 … +1
}

// Draw filled symmetric waveform onto ctx
// points: Float32Array of raw samples (−1…+1) length = width+1
// amp: current half-height scale in px
function drawFilled(
  ctx: CanvasRenderingContext2D,
  points: Float32Array,
  width: number,
  cy: number,
  amp: number,
  speaking: boolean,
) {
  ctx.beginPath();
  // Top edge left → right
  for (let px = 0; px <= width; px++) {
    const h = Math.abs(points[px]) * amp;
    if (px === 0) ctx.moveTo(0, cy - h);
    else          ctx.lineTo(px, cy - h);
  }
  // Bottom edge right → left
  for (let px = width; px >= 0; px--) {
    ctx.lineTo(px, cy + Math.abs(points[px]) * amp);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  const a   = speaking ? 0.88 : 0.28;
  const rgb = speaking ? '74,222,128' : '185,195,215';
  grad.addColorStop(0,    `rgba(${rgb},0)`);
  grad.addColorStop(0.06, `rgba(${rgb},${a})`);
  grad.addColorStop(0.94, `rgba(${rgb},${a})`);
  grad.addColorStop(1,    `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fill();
}

interface VoiceWaveformProps {
  speaking: boolean;
  muted: boolean;
  height?: number;
  width?: number;
  seed?: number;
}

export function VoiceWaveform({
  speaking,
  muted,
  height = 40,
  width = 220,
  seed = 0,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cy      = height / 2;
    const maxAmp  = cy * 0.88;
    // Oscillation cycles visible across width — scaled so teeth are visible
    const osc = Math.max(8, Math.round(width / 9)) + seed * 0.5;
    const pts = new Float32Array(width + 1);

    let raf: number;

    const draw = (ts: number) => {
      const t = ts * 0.001;
      ctx.clearRect(0, 0, width, height);

      if (muted) {
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(width, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
        raf = requestAnimationFrame(draw);
        return;
      }

      // Global amplitude: syllable pulsing when speaking
      const amp = speaking
        ? maxAmp * (0.32 + 0.68 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.1 + seed * 1.9), 0.5))
        : maxAmp * 0.05;

      // Phase scrolls leftward over time
      const shift = t * 1.6 * Math.PI * 2;

      for (let px = 0; px <= width; px++) {
        const pos = (px / width) * osc * Math.PI * 2;
        pts[px] = hSample(shift - pos + seed * 2.1);
      }

      drawFilled(ctx, pts, width, cy, amp, speaking);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [speaking, muted, height, width, seed]);

  return (
    <canvas ref={canvasRef} style={{ width, height, display: 'block' }} aria-hidden />
  );
}

// ─── Legacy bar waveform — kept for other usages ─────────────────────────────

interface WaveformProps {
  speaking: boolean;
  muted: boolean;
  height?: number;
  color?: string;
}

const BAR_PROFILE = [
  { h: 0.40, delay: 0.00 }, { h: 0.70, delay: 0.08 },
  { h: 0.90, delay: 0.16 }, { h: 1.00, delay: 0.05 },
  { h: 0.85, delay: 0.20 }, { h: 0.95, delay: 0.12 },
  { h: 0.75, delay: 0.03 }, { h: 0.60, delay: 0.18 },
  { h: 0.35, delay: 0.10 },
];

export function Waveform({ speaking, muted, height = 32, color }: WaveformProps) {
  const barColor = color ?? (speaking ? '#4ade80' : '#ffffff33');
  const barWidth = Math.max(3, Math.round(height / 11));
  return (
    <>
      <style>{`
        @keyframes htg-wave-active { 0%,100%{transform:scaleY(0.12)} 50%{transform:scaleY(1)} }
        @keyframes htg-wave-idle   { 0%,100%{transform:scaleY(0.10)} 50%{transform:scaleY(0.22)} }
      `}</style>
      <div className="flex items-end gap-px" style={{ height, opacity: muted ? 0.25 : 1 }} aria-hidden>
        {BAR_PROFILE.map((bar, i) => (
          <div key={i} style={{
            width: barWidth, height, backgroundColor: barColor,
            borderRadius: barWidth, transformOrigin: 'bottom',
            transform: 'scaleY(0.12)',
            animation: speaking
              ? `htg-wave-active ${0.45 + bar.delay * 2}s ease-in-out ${bar.delay}s infinite`
              : `htg-wave-idle   ${1.8  + bar.delay * 3}s ease-in-out ${bar.delay}s infinite`,
          }} />
        ))}
      </div>
    </>
  );
}

// ─── Seed helper ──────────────────────────────────────────────────────────────

function identitySeed(identity: string): number {
  let h = 0;
  for (let i = 0; i < identity.length; i++) {
    h = ((h << 5) - h + identity.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 100) / 10; // 0–9.9
}

// ─── Full-size audio tile ─────────────────────────────────────────────────────

interface AudioMainTileProps { participant: Participant }

export function AudioMainTile({ participant: p }: AudioMainTileProps) {
  const speaking    = p.isSpeaking;
  const muted       = !p.isMicrophoneEnabled;
  const initial     = (p.name ?? p.identity)?.[0]?.toUpperCase() ?? '?';
  const displayName = p.name || (p.isLocal ? 'Ty' : 'Uczestnik');
  const seed        = useMemo(() => identitySeed(p.identity), [p.identity]);

  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef     = useRef(240);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      widthRef.current = Math.round(entry.contentRect.width * 0.74) || 240;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const glowColor = speaking ? 'rgba(74,222,128,0.30)' : 'rgba(255,255,255,0.04)';

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 h-full flex flex-col items-center justify-center gap-4 overflow-hidden
        transition-all duration-500
        ${speaking ? 'ring-4 ring-[#4ade80]/40 ring-inset' : ''}`}
      style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(15,20,40,0.95), #07091a 80%)' }}
    >
      <div className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ background: `radial-gradient(ellipse 55% 45% at 50% 40%, ${glowColor}, transparent 70%)` }} />

      <div
        className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300
          ${speaking
            ? 'ring-4 ring-[#4ade80]/70 shadow-[0_0_32px_8px_rgba(74,222,128,0.25)]'
            : 'ring-2 ring-white/15'}`}
        style={{ width: 96, height: 96, background: speaking ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)' }}
      >
        <span className="text-4xl font-serif text-white/90 select-none">{initial}</span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-1">
        <span className="text-white/90 font-medium text-sm tracking-wide">{displayName}</span>
        {muted && (
          <span className="flex items-center gap-1 text-red-400/80 text-xs">
            <MicOff className="w-3 h-3" /> wyciszony
          </span>
        )}
      </div>

      <div className="relative z-10">
        <VoiceWaveform speaking={speaking} muted={muted} height={48} width={widthRef.current} seed={seed} />
      </div>
    </div>
  );
}

// ─── Circle audio tile ────────────────────────────────────────────────────────

interface AudioCircleTileProps {
  participant: Participant;
  size: number;
  onClick?: () => void;
  clickable?: boolean;
}

export function AudioCircleTile({ participant: p, size, onClick, clickable }: AudioCircleTileProps) {
  const speaking    = p.isSpeaking;
  const muted       = !p.isMicrophoneEnabled;
  const initial     = (p.name ?? p.identity)?.[0]?.toUpperCase() ?? '?';
  const displayName = p.name || (p.isLocal ? 'Ty' : 'Uczestnik');
  const seed        = useMemo(() => identitySeed(p.identity), [p.identity]);

  const avatarSize = Math.round(size * 0.42);
  const waveW      = Math.round(size * 0.68);
  const waveH      = Math.round(size * 0.20);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        flex flex-col items-center justify-center transition-all duration-300
        ${speaking
          ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_24px_6px_rgba(74,222,128,0.20)]'
          : 'ring-2 ring-white/20'}
        ${clickable ? 'cursor-pointer hover:ring-4 hover:ring-white/40' : ''}`}
      style={{
        width: size, height: size,
        background: speaking
          ? 'radial-gradient(circle, rgba(74,222,128,0.12) 0%, #09102a 70%)'
          : '#0b1124',
      }}
      onClick={clickable ? onClick : undefined}
      title={clickable ? `Zamień z ${p.name || 'uczestnikiem'}` : undefined}
    >
      <div className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: avatarSize, height: avatarSize,
          background: speaking ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.07)',
        }}
      >
        <span className="font-serif text-white/90 select-none"
          style={{ fontSize: Math.round(avatarSize * 0.45) }}>
          {initial}
        </span>
      </div>

      <div className="mt-1 overflow-hidden" style={{ width: waveW }}>
        <VoiceWaveform speaking={speaking} muted={muted} height={waveH} width={waveW} seed={seed} />
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/80 truncate px-1 font-medium">{displayName}</span>
      </div>

      {muted && (
        <div className="absolute top-1 right-1 bg-red-500/80 rounded-full p-0.5">
          <MicOff className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  );
}
