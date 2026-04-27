import { useCallback, useEffect, useState } from "react";
import TrackPlayer, {
  State,
  useProgress as usePlayerProgress,
  usePlaybackState,
} from "react-native-track-player";
import type { SessionDetail, PlaybackUrl } from "@htg/shared";

import { sessionsApi } from "../api/sessions";
import { setupPlayer } from "./register";

type LoadOptions = {
  session: SessionDetail;
  autoPlay?: boolean;
};

const TOKEN_REFRESH_BUFFER_SEC = 60;

export function usePlayer() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const state = usePlaybackState();
  const progress = usePlayerProgress(500);

  useEffect(() => {
    setupPlayer().then(() => setReady(true));
  }, []);

  const scheduleRefresh = useCallback(
    (sessionId: string, expiresAt: string) => {
      const expiresInMs = new Date(expiresAt).getTime() - Date.now();
      const refreshInMs = Math.max(
        expiresInMs - TOKEN_REFRESH_BUFFER_SEC * 1000,
        30_000,
      );
      setTimeout(async () => {
        const active = await TrackPlayer.getActiveTrack();
        if (active?.id !== sessionId) return;
        try {
          const fresh = await sessionsApi.playbackUrl(sessionId);
          const pos = await TrackPlayer.getPosition();
          const trackIndex = await TrackPlayer.getActiveTrackIndex();
          if (trackIndex === undefined) return;
          await TrackPlayer.load({
            id: sessionId,
            url: fresh.url,
            type: fresh.mimeType === "application/vnd.apple.mpegurl" ? "hls" : "default",
            title: active.title,
            artist: active.artist,
            artwork: active.artwork,
            duration: active.duration,
          });
          await TrackPlayer.seekTo(pos);
          scheduleRefresh(sessionId, fresh.expiresAt);
        } catch (err) {
          console.warn("[player] token refresh failed", err);
        }
      }, refreshInMs);
    },
    [],
  );

  const load = useCallback(
    async ({ session, autoPlay = true }: LoadOptions) => {
      if (!ready) await setupPlayer();
      setLoading(true);
      try {
        const playback: PlaybackUrl = await sessionsApi.playbackUrl(session.id);
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: session.id,
          url: playback.url,
          type:
            playback.mimeType === "application/vnd.apple.mpegurl"
              ? "hls"
              : "default",
          title: session.title,
          artist: session.speakers.map((s) => s.name).join(", "),
          artwork: session.coverUrl ?? undefined,
          duration: session.durationSec ?? undefined,
        });
        if (session.lastPositionSec && session.lastPositionSec > 5) {
          await TrackPlayer.seekTo(session.lastPositionSec);
        }
        setCurrentId(session.id);
        scheduleRefresh(session.id, playback.expiresAt);
        if (autoPlay) await TrackPlayer.play();
      } finally {
        setLoading(false);
      }
    },
    [ready, scheduleRefresh],
  );

  const play = useCallback(() => TrackPlayer.play(), []);
  const pause = useCallback(() => TrackPlayer.pause(), []);
  const seekTo = useCallback((sec: number) => TrackPlayer.seekTo(sec), []);
  const skipForward = useCallback(async () => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(pos + 15);
  }, []);
  const skipBack = useCallback(async () => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, pos - 15));
  }, []);
  const setRate = useCallback((rate: number) => TrackPlayer.setRate(rate), []);

  const isPlaying = state.state === State.Playing;
  const isBuffering = state.state === State.Buffering || state.state === State.Loading;

  return {
    ready,
    loading,
    currentId,
    isPlaying,
    isBuffering,
    progress,
    load,
    play,
    pause,
    seekTo,
    skipForward,
    skipBack,
    setRate,
  };
}
