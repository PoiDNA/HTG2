'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { AudioEngineHandle, PlayerState, AnalyticsContext } from '@/components/session-review/AudioEngine';

// ─────────────────────────────────────────────────────────────────────────────
// ActivePlayback — tagged union replacing the old flat ActiveSession interface.
// Each variant carries exactly the data it needs; GlobalPlayer derives engine
// props from the active variant via `playbackToEngineProps()`.
// ─────────────────────────────────────────────────────────────────────────────

export type FragmentAnalyticsContext =
  | 'fragment_review'
  | 'fragment_radio'
  | 'fragment_recording_review';

/** Standard VOD session playback */
export interface VodPlayback {
  kind: 'vod';
  sessionId: string;
  title: string;
}

/** Personal booking-recording playback */
export interface RecordingPlayback {
  kind: 'recording';
  recordingId: string;
  title: string;
}

/** Fragment of a VOD session (single review or radio) */
export interface FragmentPlayback {
  kind: 'fragment_review' | 'fragment_radio';
  saveId: string;
  sessionId: string;          // session_template_id (for active_streams context)
  title: string;              // session title shown in mini-player
  fragmentTitle?: string;     // optional fragment-level title
  startSec: number;
  endSec: number;
}

/** Fragment of a personal booking recording */
export interface RecordingFragmentPlayback {
  kind: 'fragment_recording_review';
  saveId: string;
  recordingId: string;        // booking_recording_id
  title: string;
  fragmentTitle?: string;
  startSec: number;
  endSec: number;
}

/** Admin-curated impulse fragment (no saveId; uses sessionFragmentId) */
export interface ImpulsePlayback {
  kind: 'impulse';
  sessionFragmentId: string;
  sessionId: string;          // session_template_id
  title: string;
  fragmentTitle?: string;
  startSec: number;
  endSec: number;
}

/** Answer fragment assigned to a pytania question (po_sesji token endpoint) */
export interface PytaniaAnswerPlayback {
  kind: 'pytania_answer';
  sessionFragmentId: string;
  sessionId: string;          // session_template_id
  title: string;
  fragmentTitle?: string;
  startSec: number;
  endSec: number;
}

export type ActivePlayback =
  | VodPlayback
  | RecordingPlayback
  | FragmentPlayback
  | RecordingFragmentPlayback
  | ImpulsePlayback
  | PytaniaAnswerPlayback;

// ── Legacy alias for call sites that haven't migrated yet ─────────────────
// VodGrid and StickyPlayer can keep using ActiveSession until they adopt ActivePlayback.
/** @deprecated Use ActivePlayback with kind='vod' */
export interface ActiveSession {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  tokenEndpoint: string;
  title: string;
}

/** Derive engine props from any ActivePlayback variant */
export function playbackToEngineProps(p: ActivePlayback): ActiveSession {
  switch (p.kind) {
    case 'vod':
      return {
        playbackId: p.sessionId,
        idFieldName: 'sessionId',
        tokenEndpoint: '/api/video/token',
        title: p.title,
      };
    case 'recording':
      return {
        playbackId: p.recordingId,
        idFieldName: 'recordingId',
        tokenEndpoint: '/api/video/booking-recording-token',
        title: p.title,
      };
    case 'fragment_review':
    case 'fragment_radio':
      return {
        playbackId: p.saveId,
        idFieldName: 'saveId' as 'recordingId', // fragment-token accepts saveId
        tokenEndpoint: '/api/video/fragment-token',
        title: p.fragmentTitle ?? p.title,
      };
    case 'fragment_recording_review':
      return {
        playbackId: p.saveId,
        idFieldName: 'saveId' as 'recordingId',
        tokenEndpoint: '/api/video/fragment-token',
        title: p.fragmentTitle ?? p.title,
      };
    case 'impulse':
      return {
        playbackId: p.sessionFragmentId,
        idFieldName: 'sessionFragmentId' as 'sessionId',
        tokenEndpoint: '/api/video/fragment-token',
        title: p.fragmentTitle ?? p.title,
      };
    case 'pytania_answer':
      return {
        playbackId: p.sessionFragmentId,
        idFieldName: 'sessionFragmentId' as 'sessionId',
        tokenEndpoint: '/api/pytania/answer-token',
        title: p.fragmentTitle ?? p.title,
      };
  }
}

/** Derive the analytics context for AudioEngine from any ActivePlayback variant */
export function playbackToAnalyticsContext(p: ActivePlayback): AnalyticsContext {
  switch (p.kind) {
    case 'vod':           return 'vod';
    case 'recording':     return 'recording';
    case 'fragment_review':          return 'fragment_review';
    case 'fragment_radio':           return 'fragment_radio';
    case 'fragment_recording_review':return 'fragment_recording_review';
    case 'impulse':       return 'fragment_review';
    case 'pytania_answer': return 'fragment_review';
  }
}

/** Playback range for fragment variants (null for full-length vod/recording) */
export function playbackToRange(p: ActivePlayback): { startSec: number; endSec: number } | null {
  switch (p.kind) {
    case 'fragment_review':
    case 'fragment_radio':
    case 'fragment_recording_review':
    case 'impulse':
    case 'pytania_answer':
      return { startSec: p.startSec, endSec: p.endSec };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface PlayerContextType {
  activePlayback: ActivePlayback | null;
  /** Legacy computed — still used by StickyPlayer/GlobalPlayer until full migration */
  activeSession: ActiveSession | null;
  /** Start playback of any variant (replaces current) */
  startPlayback: (playback: ActivePlayback) => void;
  /** Legacy overload: pass an ActiveSession directly (VodGrid compat) */
  startSessionPlayback: (session: ActiveSession) => void;
  /** Stop playback completely */
  stopPlayback: () => void;
  playerState: PlayerState;
  setPlayerState: (state: PlayerState) => void;
  engineHandle: AudioEngineHandle | null;
  setEngineHandle: (handle: AudioEngineHandle | null) => void;
}

const PlayerContext = createContext<PlayerContextType>({
  activePlayback: null,
  activeSession: null,
  startPlayback: () => {},
  startSessionPlayback: () => {},
  stopPlayback: () => {},
  playerState: { status: 'loading' },
  setPlayerState: () => {},
  engineHandle: null,
  setEngineHandle: () => {},
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ status: 'loading' });
  const [engineHandle, setEngineHandle] = useState<AudioEngineHandle | null>(null);

  const startPlayback = useCallback((playback: ActivePlayback) => {
    setActivePlayback(playback);
    setPlayerState({ status: 'loading' });
  }, []);

  /** VodGrid compat: accepts legacy ActiveSession, wraps as VodPlayback */
  const startSessionPlayback = useCallback((session: ActiveSession) => {
    setActivePlayback({
      kind: 'vod',
      sessionId: session.playbackId,
      title: session.title,
    });
    setPlayerState({ status: 'loading' });
  }, []);

  const stopPlayback = useCallback(() => {
    if (engineHandle) {
      engineHandle.pause();
    }
    setActivePlayback(null);
    setPlayerState({ status: 'loading' });
    setEngineHandle(null);
  }, [engineHandle]);

  const activeSession = activePlayback ? playbackToEngineProps(activePlayback) : null;

  return (
    <PlayerContext.Provider value={{
      activePlayback,
      activeSession,
      startPlayback,
      startSessionPlayback,
      stopPlayback,
      playerState,
      setPlayerState,
      engineHandle,
      setEngineHandle,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
