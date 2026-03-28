'use client';

import { useMemo } from 'react';
import type { Participant } from 'livekit-client';
import { MicOff } from 'lucide-react';

// ─── Waveform bar definitions ───────────────────────────────────────────────
// Each bar: normalized max height (0–1) + animation phase offset
const BAR_PROFILE = [
  { h: 0.40, delay: 0.00 },
  { h: 0.70, delay: 0.08 },
  { h: 0.90, delay: 0.16 },
  { h: 1.00, delay: 0.05 },
  { h: 0.85, delay: 0.20 },
  { h: 0.95, delay: 0.12 },
  { h: 0.75, delay: 0.03 },
  { h: 0.60, delay: 0.18 },
  { h: 0.35, delay: 0.10 },
];

interface WaveformProps {
  speaking: boolean;
  muted: boolean;
  /** px — height of bar container */
  height?: number;
  color?: string; // tailwind-style hex / css color
}

export function Waveform({ speaking, muted, height = 32, color }: WaveformProps) {
  const barColor = color ?? (speaking ? '#4ade80' : '#ffffff33');
  const barWidth = Math.max(3, Math.round(height / 11));
  const maxH = height;

  return (
    <>
      {/* Keyframe injection — scoped to component, runs once per render path */}
      <style>{`
        @keyframes htg-wave-active {
          0%,100% { transform: scaleY(0.12); }
          50%      { transform: scaleY(1);    }
        }
        @keyframes htg-wave-idle {
          0%,100% { transform: scaleY(0.10); }
          50%      { transform: scaleY(0.22); }
        }
      `}</style>

      <div
        className="flex items-end gap-px"
        style={{ height: maxH, opacity: muted ? 0.25 : 1 }}
        aria-hidden
      >
        {BAR_PROFILE.map((bar, i) => (
          <div
            key={i}
            style={{
              width: barWidth,
              height: maxH,
              backgroundColor: barColor,
              borderRadius: barWidth,
              transformOrigin: 'bottom',
              transform: 'scaleY(0.12)',
              transition: speaking ? 'background-color 0.3s' : 'background-color 0.6s',
              animation: speaking
                ? `htg-wave-active ${0.45 + bar.delay * 2}s ease-in-out ${bar.delay}s infinite`
                : `htg-wave-idle   ${1.8  + bar.delay * 3}s ease-in-out ${bar.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ─── Full-size audio tile (replaces MainTile in sesja phase) ─────────────────

interface AudioMainTileProps {
  participant: Participant;
}

export function AudioMainTile({ participant: p }: AudioMainTileProps) {
  const speaking   = p.isSpeaking;
  const muted      = !p.isMicrophoneEnabled;
  const initial    = (p.name ?? p.identity)?.[0]?.toUpperCase() ?? '?';
  const displayName = p.name || (p.isLocal ? 'Ty' : 'Uczestnik');

  const glowColor = speaking ? 'rgba(74,222,128,0.30)' : 'rgba(255,255,255,0.04)';

  return (
    <div
      className={`relative flex-1 h-full flex flex-col items-center justify-center gap-4 overflow-hidden
        transition-all duration-500
        ${speaking ? 'ring-4 ring-[#4ade80]/40 ring-inset' : ''}`}
      style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(15,20,40,0.95), #07091a 80%)' }}
    >
      {/* Soft radial glow behind avatar */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% 40%, ${glowColor}, transparent 70%)`,
        }}
      />

      {/* Avatar */}
      <div
        className={`relative z-10 flex items-center justify-center rounded-full
          transition-all duration-300
          ${speaking
            ? 'ring-4 ring-[#4ade80]/70 shadow-[0_0_32px_8px_rgba(74,222,128,0.25)]'
            : 'ring-2 ring-white/15'
          }`}
        style={{ width: 96, height: 96, background: speaking ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)' }}
      >
        <span className="text-4xl font-serif text-white/90 select-none">{initial}</span>
      </div>

      {/* Name */}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span className="text-white/90 font-medium text-sm tracking-wide">{displayName}</span>
        {muted && (
          <span className="flex items-center gap-1 text-red-400/80 text-xs">
            <MicOff className="w-3 h-3" /> wyciszony
          </span>
        )}
      </div>

      {/* Waveform */}
      <div className="relative z-10">
        <Waveform speaking={speaking} muted={muted} height={36} />
      </div>
    </div>
  );
}

// ─── Circle audio tile (replaces CircleTile in sesja phase) ─────────────────

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

  // Waveform height scales with circle size
  const waveH = Math.round(size * 0.22);
  const avatarSize = Math.round(size * 0.48);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl flex flex-col items-center justify-center
        transition-all duration-300
        ${speaking
          ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_24px_6px_rgba(74,222,128,0.20)]'
          : 'ring-2 ring-white/20'
        }
        ${clickable ? 'cursor-pointer hover:ring-4 hover:ring-white/40' : ''}`}
      style={{
        width: size,
        height: size,
        background: speaking
          ? 'radial-gradient(circle, rgba(74,222,128,0.12) 0%, #09102a 70%)'
          : '#0b1124',
      }}
      onClick={clickable ? onClick : undefined}
      title={clickable ? `Zamień z ${p.name || 'uczestnikiem'}` : undefined}
    >
      {/* Avatar initial */}
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: avatarSize,
          height: avatarSize,
          background: speaking ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.07)',
        }}
      >
        <span
          className="font-serif text-white/90 select-none"
          style={{ fontSize: Math.round(avatarSize * 0.45) }}
        >
          {initial}
        </span>
      </div>

      {/* Mini waveform inside circle */}
      <div className="mt-1">
        <Waveform speaking={speaking} muted={muted} height={waveH} />
      </div>

      {/* Name at bottom */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/80 truncate px-1 font-medium">{displayName}</span>
      </div>

      {/* Muted badge */}
      {muted && (
        <div className="absolute top-1 right-1 bg-red-500/80 rounded-full p-0.5">
          <MicOff className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  );
}
