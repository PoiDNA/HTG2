import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type RemoteParticipant,
  type LocalParticipant,
  type Participant,
} from "livekit-client";
import { registerGlobals } from "@livekit/react-native";

import { sessionsApi } from "../api/sessions";

let globalsRegistered = false;
function ensureGlobals() {
  if (!globalsRegistered) {
    registerGlobals();
    globalsRegistered = true;
  }
}

export type RoomStatus =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting" }
  | { kind: "disconnected"; reason?: string }
  | { kind: "error"; message: string };

export function useLiveRoom(roomId: string) {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<RoomStatus>({ kind: "idle" });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [muted, setMuted] = useState(false);

  const refreshParticipants = (room: Room) => {
    setParticipants([
      room.localParticipant,
      ...Array.from(room.remoteParticipants.values()),
    ]);
  };

  useEffect(() => {
    ensureGlobals();
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: {
          maxBitrate: 32_000,
        },
      },
    });
    roomRef.current = room;

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (cancelled) return;
      switch (state) {
        case ConnectionState.Connecting:
          setStatus({ kind: "connecting" });
          break;
        case ConnectionState.Connected:
          setStatus({ kind: "connected" });
          refreshParticipants(room);
          break;
        case ConnectionState.Reconnecting:
          setStatus({ kind: "reconnecting" });
          break;
        case ConnectionState.Disconnected:
          setStatus({ kind: "disconnected" });
          break;
      }
    });
    room.on(RoomEvent.ParticipantConnected, () => refreshParticipants(room));
    room.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room));
    room.on(RoomEvent.TrackMuted, () => refreshParticipants(room));
    room.on(RoomEvent.TrackUnmuted, () => refreshParticipants(room));

    (async () => {
      try {
        setStatus({ kind: "connecting" });
        const token = await sessionsApi.liveToken(roomId);
        await room.connect(token.wsUrl, token.token, {
          autoSubscribe: true,
        });
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        if (!cancelled) {
          setStatus({ kind: "error", message: (err as Error).message });
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect().catch(() => {});
      roomRef.current = null;
    };
  }, [roomId]);

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const leave = async () => {
    await roomRef.current?.disconnect();
  };

  return { status, participants, muted, toggleMute, leave };
}

export function isSpeaking(p: Participant): boolean {
  const pub = p.getTrackPublication(Track.Source.Microphone);
  return !!pub && !pub.isMuted && (p as LocalParticipant | RemoteParticipant).isSpeaking;
}
