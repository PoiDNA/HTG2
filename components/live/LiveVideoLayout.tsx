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
  /** Optional staff controls rendered at the right side of the circle row */
  staffRight?: React.ReactNode;
}

const CIRCLE_BASE = 132;      // px — bottom self-view circles
const ASST_SIZE   = 88;       // px — assistant overlay circles
const VIDEO_TOP   = 60;       // px — offset from top of LiveVideoLayout area
const VIDEO_PCT   = 67;       // % — video height as % of container

export default function LiveVideoLayout({
  viewerIsStaff,
  room,
  phase,
  showVideo,
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

  // Primary = who goes in the big video area
  // Client sees Natalia (first remote staff) in main; staff sees client in main
  const primaryMain: Participant[] = useMemo(() =>
    viewerIsStaff ? remoteClients : remoteStaff.slice(0, 1),
  [viewerIsStaff, remoteClients, remoteStaff]);

  // Assistants = additional staff shown as overlay circles on main video
  // Client: staff[1+] (beyond Natalia);  staff: all remote staff (other assistants)
  const assistants: Participant[] = useMemo(() =>
    viewerIsStaff ? remoteStaff : remoteStaff.slice(1),
  [viewerIsStaff, remoteStaff]);

  // Bottom circles = local self-view (+ other clients if multi-client)
  const defaultCircles: Participant[] = useMemo(() => [
    ...(localParticipant ? [localParticipant] : []),
    ...(viewerIsStaff ? [] : remoteClients),
  ], [localParticipant, viewerIsStaff, remoteClients]);

  // Swap mechanic (main ↔ circles)
  const { mainParticipants, circleParticipants } = useMemo(() => {
    if (!swappedId || !localParticipant) {
      return { mainParticipants: primaryMain, circleParticipants: defaultCircles };
    }
    const swapped = participants.find((p) => p.identity === swappedId);
    if (!swapped) return { mainParticipants: primaryMain, circleParticipants: defaultCircles };

    if (primaryMain.some((p) => p.identity === swappedId)) {
      return {
        mainParticipants:  primaryMain.map((p)  => p.identity === swappedId ? localParticipant : p),
        circleParticipants: defaultCircles.map((p) => p.isLocal ? swapped : p),
      };
    }
    return {
      mainParticipants: primaryMain,
      circleParticipants: defaultCircles.map((p) => {
        if (p.isLocal) return swapped;
        if (p.identity === swappedId) return localParticipant;
        return p;
      }),
    };
  }, [swappedId, localParticipant, primaryMain, defaultCircles, participants]);

  const handleSwap = useCallback((id: string) => {
    if (id === localParticipant?.identity) return;
    setSwappedId((prev) => (prev === id ? null : id));
  }, [localParticipant]);

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

          {/* Video tiles — all corners rounded */}
          <div className="absolute inset-0 flex gap-px overflow-hidden rounded-2xl">
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

          {/* ── Assistant overlay circles — top-left of video, 1/3 hanging outside ── */}
          {assistants.length > 0 && (
            <div
              className="absolute left-0 z-10 flex flex-col"
              style={{ top: 50, gap: 40 }}
            >
              {assistants.map((p) => (
                <div key={p.identity} style={{ transform: 'translateX(-33%)' }}>
                  <CircleTile
                    participant={p}
                    videoTrack={getVideoTrack(videoTracks, p.identity)}
                    size={ASST_SIZE}
                    clickable={false}
                  />
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
