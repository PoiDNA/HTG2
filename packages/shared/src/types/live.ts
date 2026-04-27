export interface LiveRoomToken {
  wsUrl: string;
  token: string;
  roomId: string;
  identity: string;
  expiresAt: string;
}

export type ParticipantRole = "host" | "speaker" | "listener";
