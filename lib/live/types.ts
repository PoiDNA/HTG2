// ============================================================
// Live session types
// ============================================================

/** All possible phases in order */
export const PHASES = [
  'poczekalnia',
  'wstep',
  'przejscie_1',
  'sesja',
  'przejscie_2',
  'podsumowanie',
  'outro',
  'ended',
] as const;

export type Phase = (typeof PHASES)[number];

/** Database row from public.live_sessions */
export interface LiveSession {
  id: string;
  booking_id: string;
  slot_id: string;
  room_name: string;
  room_sid: string | null;
  phase: Phase;
  phase_changed_at: string;
  started_at: string | null;
  ended_at: string | null;
  egress_wstep_id: string | null;
  egress_sesja_id: string | null;
  egress_sesja_tracks_ids: Record<string, string> | null;
  egress_podsumowanie_id: string | null;
  recording_wstep_url: string | null;
  recording_sesja_url: string | null;
  recording_sesja_tracks: Record<string, string> | null;
  recording_podsumowanie_url: string | null;
  bunny_sesja_video_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Phase configuration for each phase */
export interface PhaseConfig {
  label: string;
  hasVideo: boolean;
  hasAudio: boolean;
  hasRecording: boolean;
  animationVariant: number | null;
  musicAsset: string | null;
  /** Duration in ms for transition phases (null = manual advance) */
  autoDuration: number | null;
}

/** Data channel message types */
export type DataMessageType =
  | 'break_request'
  | 'break_dismiss'
  | 'private_talk_start'
  | 'private_talk_stop'
  | 'phase_changed'
  | 'zoom_backup';

export interface DataMessage {
  type: DataMessageType;
  senderId?: string;
  payload?: Record<string, unknown>;
}

/** Participant role in the live session */
export type ParticipantRole = 'staff' | 'client';

/** Token request body */
export interface TokenRequest {
  sessionId: string;
}

/** Phase change request body */
export interface PhaseChangeRequest {
  sessionId: string;
  newPhase: Phase;
}

/** Create session request body */
export interface CreateSessionRequest {
  bookingId: string;
}

/** Admit client request body */
export interface AdmitRequest {
  sessionId: string;
}
