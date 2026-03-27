'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LiveKitRoom, RoomContext } from '@livekit/components-react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Phase, LiveSession, DataMessage } from '@/lib/live/types';
import { PHASE_CONFIG } from '@/lib/live/constants';

// Components
import WaitingRoom from '@/components/live/WaitingRoom';
import LiveVideoGrid from '@/components/live/LiveVideoGrid';
import AudioOnlyView from '@/components/live/AudioOnlyView';
import PhaseTransition from '@/components/live/PhaseTransition';
import PhaseControls from '@/components/live/PhaseControls';
import MediaControls from '@/components/live/MediaControls';
import PrivateTalkButton from '@/components/live/PrivateTalkButton';
import BreakRequestButton from '@/components/live/BreakRequestButton';
import BreakNotification from '@/components/live/BreakNotification';
import VolumeSlider from '@/components/live/VolumeSlider';
import OutroScreen from '@/components/live/OutroScreen';

interface LiveRoomProps {
  session: LiveSession;
  isStaff: boolean;
}

export default function LiveRoom({ session: initialSession, isStaff }: LiveRoomProps) {
  const t = useTranslations('Live');
  const locale = useLocale();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>(initialSession.phase);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [breakRequested, setBreakRequested] = useState(false);
  const [transitionAutoFade, setTransitionAutoFade] = useState(false);
  const [volumeNodes] = useState<Map<string, GainNode>>(new Map());

  const sessionId = initialSession.id;
  const supabase = useRef(createSupabaseBrowser());

  const [tokenError, setTokenError] = useState<string | null>(null);

  // Sync phase from DB on mount (in case SSR data is stale)
  useEffect(() => {
    async function syncPhase() {
      try {
        const res = await fetch(`/api/live/phase?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.phase && data.phase !== phase) {
            setPhase(data.phase);
          }
        }
      } catch {}
    }
    syncPhase();
    // Re-check every 5 seconds as fallback for Realtime
    const interval = setInterval(syncPhase, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Fetch LiveKit token
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          setLivekitToken(data.token);
          setLivekitUrl(data.url);
          setTokenError(null);
        } else {
          console.error('Token API error:', res.status, data);
          setTokenError(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Failed to fetch LiveKit token:', err);
        setTokenError(err instanceof Error ? err.message : 'Network error');
      }
    }
    fetchToken();
  }, [sessionId]);

  // Subscribe to Supabase Realtime for phase changes
  useEffect(() => {
    const channel = supabase.current
      .channel(`live_session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newPhase = payload.new.phase as Phase;
          if (newPhase !== phase) {
            setPhase(newPhase);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.current.removeChannel(channel);
    };
  }, [sessionId, phase]);

  // Handle data channel messages
  const handleDataReceived = useCallback(
    (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder();
        const msg: DataMessage = JSON.parse(decoder.decode(payload));

        switch (msg.type) {
          case 'break_request':
            if (isStaff) {
              setBreakRequested(true);
            }
            break;

          case 'private_talk_start':
            // Client: mute audio from staff participants
            if (!isStaff && room) {
              for (const participant of room.remoteParticipants.values()) {
                for (const pub of participant.audioTrackPublications.values()) {
                  pub.setSubscribed(false);
                }
              }
            }
            break;

          case 'private_talk_stop':
            // Client: unmute audio from staff participants
            if (!isStaff && room) {
              for (const participant of room.remoteParticipants.values()) {
                for (const pub of participant.audioTrackPublications.values()) {
                  pub.setSubscribed(true);
                }
              }
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [isStaff, room],
  );

  // Listen for room data events
  useEffect(() => {
    if (!room) return;

    const handler = (payload: Uint8Array) => {
      handleDataReceived(payload);
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room, handleDataReceived]);

  // Phase-specific auto-behaviors
  useEffect(() => {
    const config = PHASE_CONFIG[phase];

    // Auto-disable camera/mic during transitions and sesja
    if (room && !config.hasVideo) {
      room.localParticipant.setCameraEnabled(false).catch(() => {});
    }
    if (room && !config.hasAudio && phase !== 'poczekalnia') {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
    // Re-enable for video phases
    if (room && config.hasVideo) {
      room.localParticipant.setCameraEnabled(true).catch(() => {});
    }
    if (room && config.hasAudio) {
      room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
    }
  }, [phase, room]);

  // Handle phase transition completion
  const handleTransitionComplete = useCallback(() => {
    // Phase transitions auto-advance is handled by staff clicking next
  }, []);

  // Handle outro close — redirect to account page
  const handleOutroClose = useCallback(() => {
    router.push(`/${locale}/konto`);
  }, [router, locale]);

  // Handle phase change from controls
  const handlePhaseChanged = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    // For przejscie transitions, trigger auto-fade
    if (newPhase === 'sesja' || newPhase === 'podsumowanie') {
      setTransitionAutoFade(true);
      setTimeout(() => setTransitionAutoFade(false), 100);
    }
  }, []);

  // Volume control via Web Audio API
  const handleVolumeChange = useCallback(
    (participantIdentity: string, volume: number) => {
      const node = volumeNodes.get(participantIdentity);
      if (node) {
        node.gain.value = volume;
      }
    },
    [volumeNodes],
  );

  // Handle room connected
  const handleRoomConnected = useCallback((connectedRoom: Room) => {
    setRoom(connectedRoom);
  }, []);

  // Redirect if ended
  useEffect(() => {
    if (phase === 'ended') {
      router.push(`/${locale}/konto`);
    }
  }, [phase, router, locale]);

  // Show waiting room before token is fetched (or on error)
  if (!livekitToken || !livekitUrl) {
    return (
      <div className="relative w-full h-screen">
        <WaitingRoom bookingId={initialSession.booking_id} liveSessionId={sessionId} />
        {tokenError && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-red-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-xs max-w-md text-center">
            Błąd połączenia: {tokenError}
          </div>
        )}
      </div>
    );
  }

  const phaseConfig = PHASE_CONFIG[phase];

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={livekitToken}
      connect={true}
      audio={phase !== 'poczekalnia'}
      video={phase === 'wstep' || phase === 'podsumowanie'}
      onConnected={() => {}}
      options={{
        publishDefaults: {
          videoSimulcastLayers: [],
        },
        videoCaptureDefaults: {
          resolution: { width: 640, height: 480, frameRate: 24 },
        },
      }}
      className="w-full h-screen"
    >
      <RoomContext.Consumer>
        {(roomCtx) => {
          // Capture room reference
          if (roomCtx && roomCtx !== room) {
            // Use setTimeout to avoid setState during render
            setTimeout(() => handleRoomConnected(roomCtx), 0);
          }

          return (
            <div className="relative w-full h-screen bg-htg-indigo flex flex-col">
              {/* Phase label — hidden during poczekalnia */}
              {phase !== 'poczekalnia' && (
                <div className="absolute top-4 left-4 z-20 px-3 py-1
                  rounded-full bg-black/30 backdrop-blur-sm text-sm text-htg-cream/80">
                  {phaseConfig.label}
                </div>
              )}

              {/* Main content area */}
              <div className="flex-1 relative overflow-hidden">
                {phase === 'poczekalnia' && !isStaff && (
                  <WaitingRoom bookingId={initialSession.booking_id} liveSessionId={sessionId} />
                )}

                {phase === 'poczekalnia' && isStaff && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-6">
                      <div className="w-16 h-16 rounded-full bg-htg-warm/20 flex items-center justify-center mx-auto animate-pulse">
                        <span className="text-3xl">👤</span>
                      </div>
                      <p className="text-htg-cream/80 text-lg">Klient czeka w poczekalni</p>
                      <PhaseControls
                        sessionId={sessionId}
                        currentPhase={phase}
                        isStaff={isStaff}
                        onPhaseChanged={handlePhaseChanged}
                      />
                    </div>
                  </div>
                )}

                {phase === 'wstep' && <LiveVideoGrid />}

                {phase === 'przejscie_1' && (
                  <PhaseTransition
                    variant={1}
                    musicSrc="https://htg2-cdn.b-cdn.net/music-sessions/music-1.mp3"
                    autoFade={transitionAutoFade}
                    onComplete={handleTransitionComplete}
                  />
                )}

                {phase === 'sesja' && <AudioOnlyView />}

                {phase === 'przejscie_2' && (
                  <PhaseTransition
                    variant={2}
                    musicSrc="https://htg2-cdn.b-cdn.net/music-sessions/music-2.mp3"
                    autoFade={transitionAutoFade}
                    onComplete={handleTransitionComplete}
                  />
                )}

                {phase === 'podsumowanie' && <LiveVideoGrid />}

                {phase === 'outro' && <OutroScreen bookingId={initialSession.booking_id} liveSessionId={sessionId} onClose={handleOutroClose} />}
              </div>

              {/* Bottom controls bar */}
              {phase !== 'poczekalnia' && phase !== 'outro' && phase !== 'ended' && (
                <div className="relative z-20 flex items-center justify-between
                  px-6 py-4 bg-black/40 backdrop-blur-sm border-t border-white/10">
                  {/* Left: media controls */}
                  <div className="flex items-center gap-3">
                    <MediaControls
                      room={room}
                      showVideo={phaseConfig.hasVideo}
                    />
                    {!isStaff && phase === 'sesja' && (
                      <BreakRequestButton room={room} isStaff={isStaff} />
                    )}
                  </div>

                  {/* Center: volume sliders (client, sesja phase only) */}
                  {!isStaff && phase === 'sesja' && room && (
                    <div className="flex items-center gap-2">
                      {Array.from(room.remoteParticipants.values()).map((p) => (
                        <VolumeSlider
                          key={p.identity}
                          participantName={p.name ?? p.identity}
                          onVolumeChange={(vol) => handleVolumeChange(p.identity, vol)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Right: staff controls */}
                  <div className="flex items-center gap-3">
                    {isStaff && (phase === 'sesja' || phase === 'wstep' || phase === 'podsumowanie') && (
                      <PrivateTalkButton room={room} isStaff={isStaff} />
                    )}
                    <PhaseControls
                      sessionId={sessionId}
                      currentPhase={phase}
                      isStaff={isStaff}
                      onPhaseChanged={handlePhaseChanged}
                    />
                  </div>
                </div>
              )}

              {/* Poczekalnia controls moved to center of screen (inline above) */}

              {/* Break notification for staff */}
              <BreakNotification
                visible={breakRequested}
                onDismiss={() => setBreakRequested(false)}
              />
            </div>
          );
        }}
      </RoomContext.Consumer>
    </LiveKitRoom>
  );
}
