'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  pinned,
}: {
  participant: Participant;
  videoTrack: TrackReference | null;
  size: number;
  onClick?: () => void;
  clickable?: boolean;
  speaking?: boolean;
  pinned?: boolean;
}) {
  const isSpeaking = speaking ?? p.isSpeaking;
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        ${isSpeaking ? 'ring-4 ring-htg-sage' : 'ring-2 ring-white/30'}
        ${pinned ? 'ring-4 ring-htg-warm' : ''}
        ${clickable ? 'cursor-pointer hover:ring-4 hover:ring-white/60 transition-all' : ''}`}
      style={{ width: size, height: size }}
      onClick={clickable ? onClick : undefined}
      title={clickable ? `Przypnij ${p.name || 'uczestnika'} na główny ekran` : undefined}
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
  audioMode?: boolean;
  staffRight?: React.ReactNode;
}

const CIRCLE_SIZE  = 120;      // px — circle tiles
const MAX_PER_ROW  = 5;        // max circles per row before wrapping
const VIDEO_TOP    = 40;       // px — offset from top
const VIDEO_PCT    = 65;       // % — video height as % of container

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

  // ── Active speaker tracking ──────────────────────────────────────────
  // pinnedId: staff clicked to pin someone → stays on main until unpin
  // activeSpeakerId: auto-tracked from isSpeaking (for users / unpinned staff)
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const activeSpeakerRef = useRef<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Track active speaker — debounce to avoid flickering
  useEffect(() => {
    const speaking = participants.find((p) => p.isSpeaking && !p.isLocal);
    if (speaking) {
      activeSpeakerRef.current = speaking.identity;
      setActiveSpeakerId(speaking.identity);
    }
    // Don't clear when nobody speaks — keep last speaker on screen
  }, [participants]);

  const localParticipant = participants.find((p) => p.isLocal) ?? null;
  const remoteParticipants = useMemo(() => participants.filter((p) => !p.isLocal), [participants]);

  // ── Determine main participant ───────────────────────────────────────
  const mainParticipant = useMemo(() => {
    // Staff: pinned person stays, otherwise active speaker
    if (viewerIsStaff) {
      if (pinnedId) {
        const pinned = participants.find((p) => p.identity === pinnedId);
        if (pinned) return pinned;
      }
      // Fallback to active speaker or first remote
      if (activeSpeakerId) {
        const speaker = participants.find((p) => p.identity === activeSpeakerId);
        if (speaker) return speaker;
      }
      return remoteParticipants[0] ?? localParticipant;
    }

    // User: always show active speaker (no pinning)
    if (activeSpeakerId) {
      const speaker = participants.find((p) => p.identity === activeSpeakerId);
      if (speaker) return speaker;
    }
    // Fallback: first remote staff (Natalia)
    const staff = remoteParticipants.find((p) => isStaffParticipant(p));
    return staff ?? remoteParticipants[0] ?? localParticipant;
  }, [viewerIsStaff, pinnedId, activeSpeakerId, participants, remoteParticipants, localParticipant]);

  // ── Circle participants = everyone except main ───────────────────────
  const circleParticipants = useMemo(() => {
    return participants.filter((p) => p.identity !== mainParticipant?.identity);
  }, [participants, mainParticipant]);

  // ── Handle circle click ──────────────────────────────────────────────
  const handleCircleClick = useCallback((id: string) => {
    if (!viewerIsStaff) return; // Users can't pin
    // Toggle pin: click again to unpin
    setPinnedId((prev) => (prev === id ? null : id));
  }, [viewerIsStaff]);

  // ── Circle sizing — responsive rows ──────────────────────────────────
  const circleCount = circleParticipants.length;
  const circleSize = circleCount <= 3 ? CIRCLE_SIZE : circleCount <= 6 ? CIRCLE_SIZE - 16 : CIRCLE_SIZE - 28;

  // Split circles into rows
  const circleRows = useMemo(() => {
    const rows: Participant[][] = [];
    for (let i = 0; i < circleParticipants.length; i += MAX_PER_ROW) {
      rows.push(circleParticipants.slice(i, i + MAX_PER_ROW));
    }
    return rows;
  }, [circleParticipants]);

  const videoBottom = `${VIDEO_PCT}%`;
  const overlapPx = Math.round(circleSize / 3);
  const circleTop = `calc(${VIDEO_PCT}% - ${overlapPx}px)`;

  return (
    <div className="relative w-full h-full overflow-visible">

      {/* ── Main video ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: VIDEO_TOP, bottom: `calc(100% - ${videoBottom})` }}
      >
        <div className="relative h-full" style={{ width: '80%', maxWidth: 900 }}>
          <div className="absolute inset-0 flex overflow-hidden rounded-2xl">
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

          {/* Pin indicator */}
          {viewerIsStaff && pinnedId && mainParticipant?.identity === pinnedId && (
            <div className="absolute top-3 left-3 z-10 bg-htg-warm/90 text-white text-[10px] font-bold px-2 py-1 rounded-full">
              PRZYPIĘTY
            </div>
          )}
        </div>
      </div>

      {/* ── Circles — centered rows below video ──────────────────────────── */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-3"
        style={{ top: circleTop }}
      >
        {circleRows.map((row, ri) => (
          <div key={ri} className="flex items-center justify-center gap-4">
            {row.map((p) => (
              audioMode ? (
                <AudioCircleTile
                  key={p.identity}
                  participant={p}
                  size={circleSize}
                  clickable={viewerIsStaff}
                  onClick={() => handleCircleClick(p.identity)}
                />
              ) : (
                <CircleTile
                  key={p.identity}
                  participant={p}
                  videoTrack={getVideoTrack(videoTracks, p.identity)}
                  size={circleSize}
                  clickable={viewerIsStaff}
                  onClick={() => handleCircleClick(p.identity)}
                  pinned={pinnedId === p.identity}
                />
              )
            ))}
          </div>
        ))}

        {/* Controls row */}
        <div className="flex items-center gap-4">
          <MediaControls room={room} showVideo={showVideo} showBreak={!viewerIsStaff} />
          {staffRight && (
            <div className="flex items-center gap-2">
              {staffRight}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
