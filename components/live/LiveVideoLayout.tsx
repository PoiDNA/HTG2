'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  VideoTrack,
  useParticipants,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { Track, type Participant } from 'livekit-client';

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

// ─── single participant tile (used in main area) ────────────────────────────

interface TileProps {
  participant: Participant;
  videoTrack: TrackReference | null;
  onClick?: () => void;
  clickable?: boolean;
}

function MainTile({ participant: p, videoTrack, onClick, clickable }: TileProps) {
  return (
    <div
      className={`relative flex-1 h-full overflow-hidden bg-htg-indigo/70
        ${clickable ? 'cursor-pointer' : ''}
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
      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-sm text-white font-medium drop-shadow">
          {p.name || (p.isLocal ? 'Ty' : 'Uczestnik')}
        </span>
      </div>
      {/* Swap hint */}
      {clickable && (
        <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 transition-opacity
          bg-black/40 rounded-full px-2 py-0.5 text-[10px] text-white/70 pointer-events-none">
          zamień
        </div>
      )}
    </div>
  );
}

// ─── circle tile (used at bottom) ───────────────────────────────────────────

const CIRCLE_SIZE = 128; // px — base size

interface CircleProps {
  participant: Participant;
  videoTrack: TrackReference | null;
  size?: number;
  onClick?: () => void;
  clickable?: boolean;
}

function CircleTile({ participant: p, videoTrack, size = CIRCLE_SIZE, onClick, clickable }: CircleProps) {
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden
        ring-2 ring-white/30 shadow-xl
        ${p.isSpeaking ? 'ring-4 ring-htg-sage' : ''}
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
      {/* Name */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/90 truncate px-1 font-medium">
          {p.isLocal ? 'Ty' : (p.name || 'Uczestnik')}
        </span>
      </div>
    </div>
  );
}

// ─── main layout component ──────────────────────────────────────────────────

interface LiveVideoLayoutProps {
  /** Whether the local (viewing) participant is staff */
  viewerIsStaff: boolean;
}

export default function LiveVideoLayout({ viewerIsStaff }: LiveVideoLayoutProps) {
  const participants = useParticipants();
  const videoTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  // Identity of the participant we've swapped with the local participant
  const [swappedId, setSwappedId] = useState<string | null>(null);

  const localParticipant = participants.find((p) => p.isLocal) ?? null;

  // Classify remote participants
  const remoteStaff = useMemo(
    () => participants.filter((p) => !p.isLocal && isStaffParticipant(p)),
    [participants],
  );
  const remoteClients = useMemo(
    () => participants.filter((p) => !p.isLocal && !isStaffParticipant(p)),
    [participants],
  );

  // ── Default layout (before any swap) ──────────────────────────────────────
  // Viewer is client  → staff in main,   [self + other clients] in circles
  // Viewer is staff   → clients in main, [self + other staff]   in circles
  const defaultMain: Participant[] = viewerIsStaff ? remoteClients : remoteStaff;
  const defaultCircles: Participant[] = [
    ...(localParticipant ? [localParticipant] : []),
    ...(viewerIsStaff ? remoteStaff : remoteClients),
  ];

  // ── Apply swap ─────────────────────────────────────────────────────────────
  const { mainParticipants, circleParticipants } = useMemo(() => {
    if (!swappedId || !localParticipant) {
      return { mainParticipants: defaultMain, circleParticipants: defaultCircles };
    }

    const swappedIsInDefaultMain = defaultMain.some((p) => p.identity === swappedId);
    const swappedParticipant = participants.find((p) => p.identity === swappedId);
    if (!swappedParticipant) {
      return { mainParticipants: defaultMain, circleParticipants: defaultCircles };
    }

    if (swappedIsInDefaultMain) {
      // Swap: local goes to main (where swapped was), swapped goes to circle (where local was)
      return {
        mainParticipants: defaultMain.map((p) =>
          p.identity === swappedId ? localParticipant : p,
        ),
        circleParticipants: defaultCircles.map((p) =>
          p.isLocal ? swappedParticipant : p,
        ),
      };
    }

    // Both are in circles — swap their circle positions
    return {
      mainParticipants: defaultMain,
      circleParticipants: defaultCircles.map((p) => {
        if (p.isLocal) return swappedParticipant;
        if (p.identity === swappedId) return localParticipant;
        return p;
      }),
    };
  }, [swappedId, localParticipant, defaultMain, defaultCircles, participants]);

  const handleSwap = useCallback(
    (participantId: string) => {
      if (participantId === localParticipant?.identity) return;
      setSwappedId((prev) => (prev === participantId ? null : participantId));
    },
    [localParticipant],
  );

  // Circle size adapts to number of circles
  const circleSize =
    circleParticipants.length <= 1 ? 140 :
    circleParticipants.length === 2 ? 128 :
    circleParticipants.length === 3 ? 112 : 96;

  // Overlap: circles straddle the 67%/33% boundary — top 1/3 of circle overlaps main
  const overlapPx = Math.round(circleSize / 3);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── Main area: top 2/3 ───────────────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 flex gap-px" style={{ height: '67%' }}>
        {mainParticipants.length === 0 ? (
          <div className="flex-1 bg-htg-indigo/50 flex items-center justify-center">
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

      {/* Subtle gradient blending main → lower area */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{
          top: `calc(67% - 64px)`,
          height: 64,
          background: 'linear-gradient(to bottom, transparent, rgba(6,8,24,0.4))',
        }}
      />

      {/* ── Circle row: straddles the 67% line ──────────────────────────── */}
      <div
        className="absolute inset-x-0 flex justify-center items-start gap-4 px-4"
        style={{ top: `calc(67% - ${overlapPx}px)` }}
      >
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
    </div>
  );
}
