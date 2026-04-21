import TrackPlayer, { Event } from "react-native-track-player";

import { sessionsApi } from "../api/sessions";

let positionSaveTimer: ReturnType<typeof setInterval> | null = null;

export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    TrackPlayer.seekTo(position),
  );
  TrackPlayer.addEventListener(Event.RemoteJumpForward, async ({ interval }) => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(pos + (interval ?? 15));
  });
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async ({ interval }) => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, pos - (interval ?? 15)));
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    if (positionSaveTimer) clearInterval(positionSaveTimer);
    positionSaveTimer = setInterval(async () => {
      const track = await TrackPlayer.getActiveTrack();
      const sessionId = track?.id;
      if (!sessionId) return;
      const position = await TrackPlayer.getPosition();
      sessionsApi.savePosition(sessionId, position).catch(() => {});
    }, 10_000);
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (err) => {
    console.warn("[player] error", err);
  });
}
