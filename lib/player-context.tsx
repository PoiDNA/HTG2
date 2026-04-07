'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { AudioEngineHandle, PlayerState } from '@/components/session-review/AudioEngine';

export interface ActiveSession {
  playbackId: string;
  idFieldName: 'recordingId' | 'sessionId';
  tokenEndpoint: string;
  title: string;
}

interface PlayerContextType {
  /** Currently active session (null = nothing playing) */
  activeSession: ActiveSession | null;
  /** Start playback of a session (replaces current) */
  startPlayback: (session: ActiveSession) => void;
  /** Stop playback completely */
  stopPlayback: () => void;
  /** Player state from AudioEngine */
  playerState: PlayerState;
  setPlayerState: (state: PlayerState) => void;
  /** AudioEngine handle ref (set by GlobalPlayer) */
  engineHandle: AudioEngineHandle | null;
  setEngineHandle: (handle: AudioEngineHandle | null) => void;
}

const PlayerContext = createContext<PlayerContextType>({
  activeSession: null,
  startPlayback: () => {},
  stopPlayback: () => {},
  playerState: { status: 'loading' },
  setPlayerState: () => {},
  engineHandle: null,
  setEngineHandle: () => {},
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ status: 'loading' });
  const [engineHandle, setEngineHandle] = useState<AudioEngineHandle | null>(null);

  const startPlayback = useCallback((session: ActiveSession) => {
    setActiveSession(session);
    setPlayerState({ status: 'loading' });
  }, []);

  const stopPlayback = useCallback(() => {
    if (engineHandle) {
      engineHandle.pause();
    }
    setActiveSession(null);
    setPlayerState({ status: 'loading' });
    setEngineHandle(null);
  }, [engineHandle]);

  return (
    <PlayerContext.Provider value={{
      activeSession,
      startPlayback,
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
