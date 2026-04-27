export type SessionKind = "live" | "recorded";
export type SessionStatus = "scheduled" | "live" | "ended" | "published";

export interface SessionSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  durationSec: number | null;
  kind: SessionKind;
  status: SessionStatus;
  startsAt: string | null;
  publishedAt: string | null;
  isEntitled: boolean;
  locale: string;
}

export interface Speaker {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
}

export interface SessionDetail extends SessionSummary {
  longDescription: string | null;
  speakers: Speaker[];
  liveRoomId: string | null;
  lastPositionSec: number | null;
  momentCount: number;
}

export interface PlaybackUrl {
  url: string;
  expiresAt: string;
  mediaVersion: number;
  mimeType: "application/vnd.apple.mpegurl" | "audio/mpeg";
}
