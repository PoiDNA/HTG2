'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  VideoTrack,
  useParticipants,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { Track, type Participant, type Room } from 'livekit-client';
import type { Phase } from '@/lib/live/types';
import MediaControls from '@/components/live/MediaControls';
import { AudioMainTile, AudioCircleTile } from '@/components/live/AudioWaveTile';

// ─── helpers ───────────────────────────────────────────────────────────────

function isStaffParticipant(p: Participant): boolean {
  try { return JSON.parse(p.metadata ?? '{}').isStaff === true; }
  catch { return false; }
}

function getVideoTrack(
  videoTracks: ReturnType<typeof useTracks>,
  identity: string,
): TrackReference | null {
  const t = videoTracks.find((t) => t.participant.identity === identity);
  return t && 'publication' in t ? (t as TrackReference) : null;
}

// ─── Main tile (big area) ───────────────────────────────────────────────────

function MainTile({
  participant: p,
  videoTrack,
  onClick,
  clickable,
}: {
  participant: Participant;
  videoTrack: TrackReference | null;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={`relative flex-1 h-full overflow-hidden bg-black/40
        ${clickable ? 'cursor-pointer group' : ''}
        ${p.isSpeaking ? 'ring-4 ring-htg-sage ring-inset' : ''}`}
      onClick={clickable ? onClick : undefined}
    >
      {videoTrack ? (
        <VideoTrack trackRef={videoTrack} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <div className="w-24 h-24 rounded-full bg-htg-lavender/30 flex items-center justify-center">
            <span className="text-4xl font-serif text-htg-cream">
              {p.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <span className="text-htg-cream/50 text-sm">Kamera wyłączona</span>
        </div>
      )}
      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-sm text-white font-medium drop-shadow">
          {p.name || (p.isLocal ? 'Ty' : 'Uczestnik')}
        </span>
      </div>
      {/* Swap hint on hover */}
      {clickable && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
          <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
            bg-black/50 rounded-full px-2 py-0.5 text-[10px] text-white/80">
            zamień ⇄
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Circle tile ────────────────────────────────────────────────────────────

function CircleTile({
  participant: p,
  videoTrack,
  size,
  onClick,
  clickable,
  speaking,
}: {
  participant: Participant;
  videoTrack: TrackReference | null;
  size: number;
  onClick?: () => void;
  clickable?: boolean;
  speaking?: boolean;
}) {
  const isSpeaking = speaking ?? p.isSpeaking;
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        ${isSpeaking ? 'ring-4 ring-htg-sage' : 'ring-2 ring-white/30'}
        ${clickable ? 'cursor-pointer hover:ring-4 hover:ring-white/60 transition-all' : ''}`}
      style={{ width: size, height: size }}
      onClick={clickable ? onClick : undefined}
      title={clickable ? `Zamień z ${p.name || 'uczestnikiem'}` : undefined}
    >
      {videoTrack ? (
        <VideoTrack trackRef={videoTrack} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-htg-lavender/40 flex items-center justify-center">
          <span className="text-2xl font-serif text-htg-cream">
            {p.name?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/90 truncate px-1 font-medium">
          {p.isLocal ? 'Ty' : (p.name || 'Uczestnik')}
        </span>
      </div>
    </div>
  );
}

// ─── Main layout ────────────────────────────────────────────────────────────

interface LiveVideoLayoutProps {
  viewerIsStaff: boolean;
  room: Room;
  phase: Phase;
  showVideo: boolean;
  /** Faza 2: zachowaj układ kafelków ale pokaż fale audio zamiast wideo */
  audioMode?: boolean;
  /** Optional staff controls rendered at the right side of the circle row */
  staffRight?: React.ReactNode;
}

const CIRCLE_BASE = 132;      // px — bottom self-view circles
const ASST_SIZE   = 220;      // px — assistant overlay circle (right side)
const VIDEO_TOP   = 60;       // px — offset from top of LiveVideoLayout area
const VIDEO_PCT   = 67;       // % — video height as % of container

export default function LiveVideoLayout({
  viewerIsStaff,
  room,
  phase,
  showVideo,
  audioMode = false,
  staffRight,
}: LiveVideoLayoutProps) {
  const participants = useParticipants();
  const videoTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const [swappedId, setSwappedId] = useState<string | null>(null);

  const localParticipant = participants.find((p) => p.isLocal) ?? null;
  const remoteStaff    = useMemo(() => participants.filter((p) => !p.isLocal && isStaffParticipant(p)),  [participants]);
  const remoteClients  = useMemo(() => participants.filter((p) => !p.isLocal && !isStaffParticipant(p)), [participants]);

  // Natalia = first remote staff (practitioner). Always default main.
  // Assistants = additional remote staff (Agata, Justyna, Przemek)
  const natalia = remoteStaff[0] ?? null;
  const assistants = useMemo(() => remoteStaff.slice(1), [remoteStaff]);

  // Default main participant = Natalia (for everyone)
  // If local user IS Natalia (first staff), main = client instead
  const defaultMainParticipant = useMemo(() => {
    if (natalia) return natalia;
    // Fallback: if no remote staff, show first client
    return remoteClients[0] ?? null;
  }, [natalia, remoteClients]);

  // Swap: clicking any circle swaps that person into main
  const mainParticipant = useMemo(() => {
    if (!swappedId) return defaultMainParticipant;
    const found = participants.find((p) => p.identity === swappedId);
    return found ?? defaultMainParticipant;
  }, [swappedId, defaultMainParticipant, participants]);

  // Bottom circles = everyone except main participant
  const circleParticipants = useMemo(() => {
    const all = [
      ...(localParticipant ? [localParticipant] : []),
      ...remoteClients,
      // Natalia goes to circles if swapped out of main
      ...(natalia && mainParticipant?.identity !== natalia.identity ? [natalia] : []),
    ];
    // Remove whoever is currently in main
    return all.filter((p) => p.identity !== mainParticipant?.identity);
  }, [localParticipant, remoteClients, natalia, mainParticipant]);

  const handleSwap = useCallback((id: string) => {
    setSwappedId((prev) => (prev === id ? null : id));
  }, []);

  const circleCount = circleParticipants.length;
  const circleSize  = circleCount <= 1 ? CIRCLE_BASE + 8 : circleCount === 2 ? CIRCLE_BASE : circleCount === 3 ? CIRCLE_BASE - 16 : CIRCLE_BASE - 28;
  const overlapPx   = Math.round(circleSize / 3);

  // CSS helpers for video positioning
  // Video: starts VIDEO_TOP px from top, ends at VIDEO_PCT% of container height
  const videoBottom = `${VIDEO_PCT}%`;
  const circleTop   = `calc(${VIDEO_PCT}% - ${overlapPx}px)`;
  const gradientTop = `calc(${VIDEO_PCT}% - 48px)`;

  return (
    <div className="relative w-full h-full overflow-visible">

      {/* ── Main video ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: VIDEO_TOP, bottom: `calc(100% - ${videoBottom})` }}
      >
        {/* Relative wrapper: video tiles + assistant overlay */}
        <div className="relative h-full" style={{ width: '70%' }}>

          {/* Video / Audio wave tile — single main participant */}
          <div className="absolute inset-0 flex gap-px overflow-hidden rounded-2xl">
            {!mainParticipant ? (
              <div className="flex-1 bg-black/30 flex items-center justify-center">
                <p className="text-htg-cream/30 text-sm">Oczekiwanie na uczestników...</p>
              </div>
            ) : audioMode ? (
              <AudioMainTile key={mainParticipant.identity} participant={mainParticipant} />
            ) : (
              <MainTile
                key={mainParticipant.identity}
                participant={mainParticipant}
                videoTrack={getVideoTrack(videoTracks, mainParticipant.identity)}
                clickable={false}
              />
            )}
          </div>

          {/* ── Assistant overlay circle — RIGHT side, 2/3 on screen ── */}
          {assistants.length > 0 && (
            <div
              className="absolute right-0 z-10 flex flex-col items-end"
              style={{ top: '50%', transform: 'translateY(-50%)', gap: 24 }}
            >
              {assistants.map((p) => (
                <div key={p.identity} style={{ transform: 'translateX(33%)' }}>
                  {audioMode ? (
                    <AudioCircleTile
                      participant={p}
                      size={ASST_SIZE}
                      clickable
                      onClick={() => handleSwap(p.identity)}
                    />
                  ) : (
                    <CircleTile
                      participant={p}
                      videoTrack={getVideoTrack(videoTracks, p.identity)}
                      size={ASST_SIZE}
                      clickable
                      onClick={() => handleSwap(p.identity)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Soft gradient at bottom edge of video */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ top: gradientTop, height: 48, background: 'linear-gradient(to bottom, transparent, rgba(6,8,28,0.5))' }}
      />

      {/* ── Circle row (self-view) + controls ────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex items-start justify-between px-6"
        style={{ top: circleTop }}
      >
        {/* Left spacer */}
        <div style={{ minWidth: 48 }} />

        {/* Center: self-view circle(s) + controls */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-start justify-center gap-4">
            {circleParticipants.map((p) => (
              audioMode ? (
                <AudioCircleTile
                  key={p.identity}
                  participant={p}
                  size={circleSize}
                  clickable={!p.isLocal}
                  onClick={() => handleSwap(p.identity)}
                />
              ) : (
                <CircleTile
                  key={p.identity}
                  participant={p}
                  videoTrack={getVideoTrack(videoTracks, p.identity)}
                  size={circleSize}
                  clickable={!p.isLocal}
                  onClick={() => handleSwap(p.identity)}
                />
              )
            ))}
          </div>
          <MediaControls room={room} showVideo={showVideo} showBreak={!viewerIsStaff} />
        </div>

        {/* Right: staff controls (Zoom + PhaseControls) at circle height */}
        <div className="flex flex-col items-end gap-2 self-center" style={{ minWidth: 48 }}>
          {staffRight}
        </div>
      </div>
    </div>
  );
}
