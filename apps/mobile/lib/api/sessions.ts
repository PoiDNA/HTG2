import { apiFetch } from "./client";
import type {
  SessionSummary,
  SessionDetail,
  PlaybackUrl,
  LiveRoomToken,
  Moment,
} from "@htg/shared";

export const sessionsApi = {
  list: (params?: { locale?: string; cursor?: string }) =>
    apiFetch<{ items: SessionSummary[]; nextCursor: string | null }>(
      `/api/mobile/sessions?${new URLSearchParams(
        params as Record<string, string>,
      ).toString()}`,
    ),

  get: (id: string) =>
    apiFetch<SessionDetail>(`/api/mobile/sessions/${id}`),

  playbackUrl: (id: string) =>
    apiFetch<PlaybackUrl>(`/api/mobile/sessions/${id}/playback`),

  savePosition: (id: string, positionSec: number) =>
    apiFetch<{ ok: true }>(`/api/mobile/sessions/${id}/position`, {
      method: "POST",
      body: JSON.stringify({ positionSec }),
    }),

  listMoments: (id: string) =>
    apiFetch<{ items: Moment[] }>(`/api/mobile/sessions/${id}/moments`),

  liveToken: (roomId: string) =>
    apiFetch<LiveRoomToken>(`/api/mobile/live/${roomId}/token`, {
      method: "POST",
    }),
};
