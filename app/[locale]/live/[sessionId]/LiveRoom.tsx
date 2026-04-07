'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LiveKitRoom, RoomAudioRenderer, useRoomContext, useConnectionState } from '@livekit/components-react';
import { Room, RoomEvent, DataPacket_Kind, ConnectionState } from 'livekit-client';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Phase, LiveSession, DataMessage } from '@/lib/live/types';
import { PHASE_CONFIG } from '@/lib/live/constants';

// Components
import WaitingRoom from '@/components/live/WaitingRoom';
import LiveVideoLayout from '@/components/live/LiveVideoLayout';
import LiveControls from '@/components/live/LiveControls';
import PhaseTransition from '@/components/live/PhaseTransition';
import PhaseControls from '@/components/live/PhaseControls';
import MediaControls from '@/components/live/MediaControls';
import PrivateTalkButton from '@/components/live/PrivateTalkButton';
import BreakNotification from '@/components/live/BreakNotification';
import VolumeSlider from '@/components/live/VolumeSlider';
import OutroScreen from '@/components/live/OutroScreen';
import ZoomBackupButton from '@/components/live/ZoomBackupButton';
import ZoomBackupOverlay from '@/components/live/ZoomBackupOverlay';
import SessionAnimation from '@/components/live/SessionAnimation';
import { SessionTimer } from '@/components/live/SessionTimer';

interface LiveRoomProps {
  session: LiveSession;
  isStaff: boolean;
}

// ─── Inner component (has access to LiveKit Room context) ───────────────────

interface InnerProps {
  initialSession: LiveSession;
  isStaff: boolean;
  phase: Phase;
  setPhase: (p: Phase) => void;
}

function LiveRoomInner({ initialSession, isStaff, phase, setPhase }: InnerProps) {
  const t = useTranslations('Live');
  const locale = useLocale();
  const router = useRouter();
  const room = useRoomContext();
  const connectionState = useConnectionState();

  const [breakRequested, setBreakRequested] = useState(false);
  const [transitionAutoFade, setTransitionAutoFade] = useState(false);
  const [volumeNodes] = useState<Map<string, GainNode>>(new Map());
  const [zoomBackupUrl, setZoomBackupUrl] = useState<string | null>(null);
  // Timer: tracks when current phase started (updated locally on phase change)
  const [phaseChangedAt, setPhaseChangedAt] = useState(initialSession.phase_changed_at);

  const sessionId = initialSession.id;

  // Enable/disable camera & mic based on phase
  useEffect(() => {
    if (!room) return;
    const config = PHASE_CONFIG[phase];
    const wantVideo = config.hasVideo ?? false;
    const wantAudio = (config.hasAudio ?? false) && phase !== 'poczekalnia';

    room.localParticipant.setCameraEnabled(wantVideo).catch(() => {});
    room.localParticipant.setMicrophoneEnabled(wantAudio).catch(() => {});
  }, [phase, room]);

  // Handle data channel messages
  const handleDataReceived = useCallback(
    (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder();
        const msg: DataMessage = JSON.parse(decoder.decode(payload));

        switch (msg.type) {
          case 'break_request':
            if (isStaff) setBreakRequested(true);
            break;

          case 'private_talk_start':
            if (!isStaff) {
              for (const participant of room.remoteParticipants.values()) {
                for (const pub of participant.audioTrackPublications.values()) {
                  pub.setSubscribed(false);
                }
              }
            }
            break;

          case 'private_talk_stop':
            if (!isStaff) {
              for (const participant of room.remoteParticipants.values()) {
                for (const pub of participant.audioTrackPublications.values()) {
                  pub.setSubscribed(true);
                }
              }
            }
            break;

          case 'zoom_backup': {
            const url = msg.payload?.url as string | undefined;
            if (url) setZoomBackupUrl(url);
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [isStaff, room],
  );

  useEffect(() => {
    const handler = (payload: Uint8Array) => handleDataReceived(payload);
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, handleDataReceived]);

  const handleTransitionComplete = useCallback(() => {}, []);

  const handleOutroClose = useCallback(() => {
    router.push(`/${locale}/konto`);
  }, [router, locale]);

  const handlePhaseChanged = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    setPhaseChangedAt(new Date().toISOString());
    if (newPhase === 'sesja' || newPhase === 'podsumowanie') {
      setTransitionAutoFade(true);
      setTimeout(() => setTransitionAutoFade(false), 100);
    }
  }, [setPhase]);

  const handleVolumeChange = useCallback(
    (participantIdentity: string, volume: number) => {
      const node = volumeNodes.get(participantIdentity);
      if (node) node.gain.value = volume;
    },
    [volumeNodes],
  );

  useEffect(() => {
    if (phase === 'ended') router.push(`/${locale}/konto`);
  }, [phase, router, locale]);

  const phaseConfig = PHASE_CONFIG[phase];
  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting = connectionState === ConnectionState.Connecting;
  const isVideoPhase = phase === 'wstep' || phase === 'podsumowanie';
  const backUrl = `/${locale}/konto`;

  // Pick animation variant based on phase
  const animVariant = phase === 'sesja' || phase === 'przejscie_1' ? 1
    : phase === 'przejscie_2' ? 2
    : phase === 'outro' ? 3
    : 0;

  return (
    <div className="relative w-full h-screen bg-htg-bg flex flex-col">

      {/* Branding removed from here — rendered inside LiveVideoLayout instead */}

      {/* Persistent ambient particle animation — behind all content */}
      {phase !== 'wstep' && phase !== 'podsumowanie' && phase !== 'poczekalnia' && (
        <SessionAnimation variant={animVariant} opacity={0.45} active />
      )}

      {/* ── Top header bar — 60px ─────────────────────────────────────────── */}
      {phase !== 'poczekalnia' && phase !== 'outro' && phase !== 'ended' && (
        <div className="relative z-30 flex-shrink-0 h-[60px] flex items-center justify-between px-4">
          <LiveControls backUrl={backUrl} standalone={false} />

          {/* REC indicator removed — consent covers recording */}

          {/* Connection state badge */}
          {!isConnected && (
            <div className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
              bg-black/40 backdrop-blur-sm text-xs text-htg-cream/70 pointer-events-none">
              {isConnecting ? 'Łączenie...' : connectionState}
            </div>
          )}

          {/* Session timer — staff only */}
          {isStaff && (
            <SessionTimer
              startedAt={initialSession.started_at}
              phaseChangedAt={phaseChangedAt}
              phase={phase}
            />
          )}
        </div>
      )}

      {/* Phase label — only for non-video non-waiting phases */}
      {phase !== 'poczekalnia' && !isVideoPhase && phase !== 'outro' && phase !== 'ended' && (
        <div className="relative z-20 flex justify-center pb-1 pointer-events-none">
          <div className="px-3 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-xs text-htg-cream/50">
            {phaseConfig.label}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 relative overflow-hidden">

        {phase === 'poczekalnia' && !isStaff && (
          <WaitingRoom bookingId={initialSession.booking_id} liveSessionId={sessionId} />
        )}

        {phase === 'poczekalnia' && isStaff && (
          <div className="flex items-center justify-center h-full">
            <LiveControls backUrl={backUrl} />
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

        {/* Video phases — LiveVideoLayout handles media controls internally */}
        {phase === 'wstep' && (
          <LiveVideoLayout
            viewerIsStaff={isStaff}
            room={room}
            phase={phase}
            showVideo={true}
          />
        )}

        {phase === 'przejscie_1' && (
          <>
            <PhaseTransition
              variant={1}
              musicSrc="https://htg2-cdn.b-cdn.net/music-sessions/music-1.mp3"
              autoFade={transitionAutoFade}
              onComplete={handleTransitionComplete}
            />
            {isStaff && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50">
                <PhaseControls
                  sessionId={sessionId}
                  currentPhase={phase}
                  isStaff={isStaff}
                  onPhaseChanged={handlePhaseChanged}
                />
              </div>
            )}
          </>
        )}

        {phase === 'sesja' && (
          <LiveVideoLayout
            viewerIsStaff={isStaff}
            room={room}
            phase={phase}
            showVideo={false}
            audioMode={true}
          />
        )}

        {phase === 'przejscie_2' && (
          <>
            <PhaseTransition
              variant={2}
              musicSrc="https://htg2-cdn.b-cdn.net/music-sessions/music-2.mp3"
              autoFade={transitionAutoFade}
              onComplete={handleTransitionComplete}
            />
            {isStaff && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50">
                <PhaseControls
                  sessionId={sessionId}
                  currentPhase={phase}
                  isStaff={isStaff}
                  onPhaseChanged={handlePhaseChanged}
                />
              </div>
            )}
          </>
        )}

        {phase === 'podsumowanie' && (
          <LiveVideoLayout
            viewerIsStaff={isStaff}
            room={room}
            phase={phase}
            showVideo={true}
          />
        )}

        {phase === 'outro' && (
          <OutroScreen
            bookingId={initialSession.booking_id}
            liveSessionId={sessionId}
            onClose={handleOutroClose}
          />
        )}
      </div>

      {/* ── Staff fixed controls — all active phases ───────────────────── */}
      {isStaff && phase !== 'poczekalnia' && phase !== 'outro' && phase !== 'ended' && phase !== 'przejscie_1' && phase !== 'przejscie_2' && (
        <>
          {/* ZOOM — top-left, transparent, blue on hover */}
          <div className="fixed top-20 left-4 z-50">
            <ZoomBackupButton room={room} compact onUrlSent={setZoomBackupUrl} />
          </div>

          {/* Phase button — bottom-right on desktop, bottom-left on mobile (arrow only) */}
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <PhaseControls
              sessionId={sessionId}
              currentPhase={phase}
              isStaff={isStaff}
              onPhaseChanged={handlePhaseChanged}
            />
          </div>
          <div className="fixed bottom-6 left-4 z-50 sm:hidden">
            <PhaseControls
              sessionId={sessionId}
              currentPhase={phase}
              isStaff={isStaff}
              onPhaseChanged={handlePhaseChanged}
              compact
            />
          </div>

          {/* Private talk — desktop only, bottom-left */}
          {phase === 'sesja' && (
            <div className="fixed bottom-6 left-6 z-50 hidden sm:block">
              <PrivateTalkButton room={room} isStaff={isStaff} />
            </div>
          )}
        </>
      )}

      {/* ── Client volume sliders — audio phase only ──────────────────── */}
      {!isStaff && phase === 'sesja' && (
        <div className="fixed bottom-6 right-6 z-50 hidden sm:flex items-center gap-2">
          {Array.from(room.remoteParticipants.values()).map((p) => (
            <VolumeSlider
              key={p.identity}
              participantName={p.name ?? p.identity}
              onVolumeChange={(vol) => handleVolumeChange(p.identity, vol)}
            />
          ))}
        </div>
      )}


      <BreakNotification
        visible={breakRequested}
        onDismiss={() => setBreakRequested(false)}
      />

      <ZoomBackupOverlay
        url={zoomBackupUrl}
        onDismiss={() => setZoomBackupUrl(null)}
      />
    </div>
  );
}

// ─── Outer component (manages token, phase, Supabase realtime) ───────────────

export default function LiveRoom({ session: initialSession, isStaff }: LiveRoomProps) {
  const [phase, setPhase] = useState<Phase>(initialSession.phase);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  const sessionId = initialSession.id;
  const supabase = useRef(createSupabaseBrowser());

  // Sync phase from DB on mount and every 5s (fallback for Supabase Realtime)
  useEffect(() => {
    async function syncPhase() {
      try {
        const res = await fetch(`/api/live/phase?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.phase) setPhase(data.phase as Phase);
        }
      } catch {}
    }
    syncPhase();
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
          setTokenError(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
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
          if (newPhase) setPhase(newPhase);
        },
      )
      .subscribe();

    return () => { supabase.current.removeChannel(channel); };
  }, [sessionId]);

  // Show waiting room while token is loading
  if (!livekitToken || !livekitUrl) {
    return (
      <div className="relative w-full h-screen">
        <WaitingRoom bookingId={initialSession.booking_id} liveSessionId={sessionId} />
        {tokenError && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30
            bg-red-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl
            text-xs max-w-md text-center">
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
      // Always connect audio; camera enabled/disabled per-phase in LiveRoomInner
      audio={phase !== 'poczekalnia'}
      video={phaseConfig.hasVideo ?? false}
      options={{
        publishDefaults: {
          videoSimulcastLayers: [],
        },
        videoCaptureDefaults: {
          resolution: { width: 640, height: 480, frameRate: 24 },
        },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }}
      className="w-full h-screen"
    >
      {/* RoomAudioRenderer must be inside LiveKitRoom — plays all remote audio */}
      <RoomAudioRenderer />

      <LiveRoomInner
        initialSession={initialSession}
        isStaff={isStaff}
        phase={phase}
        setPhase={setPhase}
      />
    </LiveKitRoom>
  );
}
