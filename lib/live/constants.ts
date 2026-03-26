import type { Phase, PhaseConfig } from './types';

// ============================================================
// Bunny CDN base URL for audio assets
// ============================================================
const CDN = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://htg2-cdn.b-cdn.net';

// ============================================================
// Phase configuration
// ============================================================

export const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  poczekalnia: {
    label: 'Poczekalnia',
    hasVideo: false,
    hasAudio: false,
    hasRecording: false,
    animationVariant: 0,
    musicAsset: `${CDN}/audio/live/music-0.mp3`,
    autoDuration: null,
  },
  wstep: {
    label: 'Wstęp',
    hasVideo: true,
    hasAudio: true,
    hasRecording: true,
    animationVariant: null,
    musicAsset: null,
    autoDuration: null,
  },
  przejscie_1: {
    label: 'Przejście do sesji',
    hasVideo: false,
    hasAudio: false,
    hasRecording: false,
    animationVariant: 1,
    musicAsset: `${CDN}/audio/live/music-1.mp3`,
    autoDuration: null, // manual — staff clicks "Rozpocznij sesję"
  },
  sesja: {
    label: 'Sesja',
    hasVideo: false,
    hasAudio: true,
    hasRecording: true,
    animationVariant: 1,
    musicAsset: null,
    autoDuration: null,
  },
  przejscie_2: {
    label: 'Przejście do podsumowania',
    hasVideo: false,
    hasAudio: false,
    hasRecording: false,
    animationVariant: 2,
    musicAsset: `${CDN}/audio/live/music-2.mp3`,
    autoDuration: 15_000, // auto fade-out 15s then proceed
  },
  podsumowanie: {
    label: 'Podsumowanie',
    hasVideo: true,
    hasAudio: true,
    hasRecording: true,
    animationVariant: null,
    musicAsset: null,
    autoDuration: null,
  },
  outro: {
    label: 'Outro',
    hasVideo: false,
    hasAudio: false,
    hasRecording: false,
    animationVariant: 3,
    musicAsset: `${CDN}/audio/live/music-3.mp3`,
    autoDuration: null,
  },
  ended: {
    label: 'Zakończona',
    hasVideo: false,
    hasAudio: false,
    hasRecording: false,
    animationVariant: null,
    musicAsset: null,
    autoDuration: null,
  },
};

// ============================================================
// Phase transition rules — each phase can only move forward
// ============================================================

export const VALID_TRANSITIONS: Record<Phase, Phase | null> = {
  poczekalnia: 'wstep',
  wstep: 'przejscie_1',
  przejscie_1: 'sesja',
  sesja: 'przejscie_2',
  przejscie_2: 'podsumowanie',
  podsumowanie: 'outro',
  outro: 'ended',
  ended: null,
};

/** Phases where staff button text differs */
export const PHASE_BUTTON_LABELS: Partial<Record<Phase, string>> = {
  poczekalnia: 'admit_client',
  wstep: 'go_to_session',
  przejscie_1: 'start_session',
  sesja: 'end_session',
  podsumowanie: 'leave_session',
};

// ============================================================
// Timing constants
// ============================================================

/** Music fade-out duration in ms */
export const MUSIC_FADE_DURATION = 15_000;

/** Outro auto-close timer in ms (15 minutes) */
export const OUTRO_TIMER_DURATION = 15 * 60 * 1000;

/** Notification sound path */
export const BREAK_NOTIFICATION_SOUND = `${CDN}/audio/live/notification.mp3`;

// ============================================================
// LiveKit room name generation
// ============================================================

export function generateRoomName(bookingId: string): string {
  const short = bookingId.slice(0, 8);
  const ts = Date.now().toString(36);
  return `htg-${short}-${ts}`;
}
