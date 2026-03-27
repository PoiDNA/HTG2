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
import BreakRequestButton from '@/components/live/BreakRequestButton';

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

// ─── Main tile (big 2/3 area) ───────────────────────────────────────────────

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

// ─── Circle tile (bottom) ───────────────────────────────────────────────────

function CircleTile({
  participant: p,
  videoTrack,
  size,
  onClick,
  clickable,
}: {
  participant: Participant;
  videoTrack: TrackReference | null;
  size: number;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        ${p.isSpeaking ? 'ring-4 ring-htg-sage' : 'ring-2 ring-white/30'}
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
}

const CIRCLE_BASE = 132; // px

export default function LiveVideoLayout({
  viewerIsStaff,
  room,
  phase,
  showVideo,
}: LiveVideoLayoutProps) {
  const participants = useParticipants();
  const videoTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const [swappedId, setSwappedId] = useState<string | null>(null);

  const localParticipant = participants.find((p) => p.isLocal) ?? null;
  const remoteStaff = useMemo(() => participants.filter((p) => !p.isLocal && isStaffParticipant(p)), [participants]);
  const remoteClients = useMemo(() => participants.filter((p) => !p.isLocal && !isStaffParticipant(p)), [participants]);

  const defaultMain: Participant[] = viewerIsStaff ? remoteClients : remoteStaff;
  const defaultCircles: Participant[] = [
    ...(localParticipant ? [localParticipant] : []),
    ...(viewerIsStaff ? remoteStaff : remoteClients),
  ];

  // Apply swap
  const { mainParticipants, circleParticipants } = useMemo(() => {
    if (!swappedId || !localParticipant) {
      return { mainParticipants: defaultMain, circleParticipants: defaultCircles };
    }
    const swappedParticipant = participants.find((p) => p.identity === swappedId);
    if (!swappedParticipant) return { mainParticipants: defaultMain, circleParticipants: defaultCircles };

    const swappedInMain = defaultMain.some((p) => p.identity === swappedId);
    if (swappedInMain) {
      return {
        mainParticipants: defaultMain.map((p) => p.identity === swappedId ? localParticipant : p),
        circleParticipants: defaultCircles.map((p) => p.isLocal ? swappedParticipant : p),
      };
    }
    // Both in circles — swap positions
    return {
      mainParticipants: defaultMain,
      circleParticipants: defaultCircles.map((p) => {
        if (p.isLocal) return swappedParticipant;
        if (p.identity === swappedId) return localParticipant;
        return p;
      }),
    };
  }, [swappedId, localParticipant, defaultMain, defaultCircles, participants]);

  const handleSwap = useCallback((id: string) => {
    if (id === localParticipant?.identity) return;
    setSwappedId((prev) => (prev === id ? null : id));
  }, [localParticipant]);

  const circleCount = circleParticipants.length;
  const circleSize = circleCount <= 1 ? CIRCLE_BASE + 8 : circleCount === 2 ? CIRCLE_BASE : circleCount === 3 ? CIRCLE_BASE - 16 : CIRCLE_BASE - 28;
  const overlapPx = Math.round(circleSize / 3);

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* ── Main video: top 67%, 70% width, centered ─────────────────────── */}
      <div className="absolute inset-x-0 top-0 flex justify-center" style={{ height: '67%' }}>
        <div className="h-full flex gap-px overflow-hidden rounded-b-2xl" style={{ width: '70%' }}>
          {mainParticipants.length === 0 ? (
            <div className="flex-1 bg-black/30 flex items-center justify-center">
              <p className="text-htg-cream/30 text-sm">Oczekiwanie na uczestników...</p>
            </div>
          ) : (
            mainParticipants.map((p) => (
              <MainTile
                key={p.identity}
                participant={p}
                videoTrack={getVideoTrack(videoTracks, p.identity)}
                clickable={!p.isLocal}
                onClick={() => handleSwap(p.identity)}
              />
            ))
          )}
        </div>
      </div>

      {/* Soft gradient at the bottom edge of main area */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ top: 'calc(67% - 48px)', height: 48, background: 'linear-gradient(to bottom, transparent, rgba(6,8,28,0.5))' }}
      />

      {/* ── Circle row + break button ─────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex items-start justify-between px-6"
        style={{ top: `calc(67% - ${overlapPx}px)` }}
      >
        {/* Left: break request (centered vertically with circle) */}
        <div
          className="flex items-center flex-shrink-0"
          style={{ height: circleSize, minWidth: 120 }}
        >
          {!viewerIsStaff && (
            <BreakRequestButton room={room} isStaff={false} />
          )}
        </div>

        {/* Center: circle tiles + controls below — always aligned together */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-start justify-center gap-4">
            {circleParticipants.map((p) => (
              <CircleTile
                key={p.identity}
                participant={p}
                videoTrack={getVideoTrack(videoTracks, p.identity)}
                size={circleSize}
                clickable={!p.isLocal}
                onClick={() => handleSwap(p.identity)}
              />
            ))}
          </div>
          <MediaControls room={room} showVideo={showVideo} />
        </div>

        {/* Right: spacer (mirror of left for centering) */}
        <div style={{ minWidth: 120 }} />
      </div>
    </div>
  );
}
