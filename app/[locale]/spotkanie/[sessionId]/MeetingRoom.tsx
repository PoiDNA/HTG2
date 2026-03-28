'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import SessionAnimation from '@/components/live/SessionAnimation';
import { VoiceWaveform } from '@/components/live/AudioWaveTile';
import { Mic, MicOff, Hand, PhoneOff, ChevronRight, ChevronDown, MessageCircle, Volume2, VolumeX, Shuffle } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface SessionState {
  status: string;
  moderatorId: string;
  currentSpeakerId: string | null;
  currentStage: { id: string; name: string; order_index: number } | null;
  currentQuestion: { id: string; question_text: string } | null;
  allMuted: boolean;
  participants: Array<{
    userId: string;
    displayName: string;
    isModerator: boolean;
    handRaised: boolean;
    isMuted: boolean;
    status: string;
  }>;
}

interface MeetingRoomProps {
  sessionId: string;
  userId: string;
  displayName: string;
  isModerator: boolean;
  meetingName: string;
  locale: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const MOD_SIZE = 264;
const PART_SIZE = 132;
const SPOTLIGHT_SIZE = 264;

// ─── Seed helper ────────────────────────────────────────────────────────────
function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100) / 10;
}

// ─── Float animation inline style ──────────────────────────────────────────
function floatStyle(seed: number, index: number): React.CSSProperties {
  const duration = 4 + (seed % 3);
  const delay = -(index * 0.7 + seed * 0.4);
  return {
    animation: `htg-float-${(index % 3) + 1} ${duration}s ease-in-out ${delay}s infinite`,
  };
}

// ─── Participant circle ────────────────────────────────────────────────────
function MeetingCircle({
  participant,
  size,
  isCurrentSpeaker,
  isModerator,
  handRaised,
  isMuted: dbMuted,
  index,
  isSpotlight = false,
}: {
  participant: Participant | null;
  size: number;
  isCurrentSpeaker: boolean;
  isModerator: boolean;
  handRaised: boolean;
  isMuted: boolean;
  index: number;
  isSpotlight?: boolean;
  name?: string;
  identity?: string;
}) {
  const speaking = participant?.isSpeaking ?? false;
  const liveMuted = participant ? !participant.isMicrophoneEnabled : false;
  const muted = liveMuted || dbMuted;
  const name = participant?.name || 'Uczestnik';
  const initial = name[0]?.toUpperCase() ?? '?';
  const seed = idSeed(participant?.identity ?? name);
  const waveW = Math.round(size * 0.65);
  const waveH = Math.round(size * 0.18);
  const avatarSz = Math.round(size * 0.35);

  const ringClass = isCurrentSpeaker
    ? 'ring-4 ring-htg-warm shadow-[0_0_60px_15px_rgba(212,167,106,0.35)]'
    : isModerator
      ? 'ring-4 ring-htg-indigo/80 shadow-[0_0_40px_8px_rgba(74,59,107,0.20)]'
      : speaking
        ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_40px_10px_rgba(74,222,128,0.18)]'
        : 'ring-2 ring-white/20';

  const bgStyle: React.CSSProperties = {
    width: size,
    height: size,
    background: isCurrentSpeaker
      ? 'radial-gradient(circle, rgba(212,167,106,0.18) 0%, #09102a 70%)'
      : isModerator
        ? 'radial-gradient(circle, rgba(74,59,107,0.16) 0%, #0b1124 70%)'
        : speaking
          ? 'radial-gradient(circle, rgba(74,222,128,0.14) 0%, #09102a 65%)'
          : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, #0b1124 70%)',
  };

  return (
    <div
      className="flex flex-col items-center gap-2"
      style={isSpotlight ? {} : floatStyle(seed, index)}
    >
      <div
        className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-2xl
          flex flex-col items-center justify-center transition-all duration-500 ${ringClass}`}
        style={bgStyle}
      >
        {/* Avatar */}
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: avatarSz,
            height: avatarSz,
            background: isCurrentSpeaker
              ? 'rgba(212,167,106,0.25)'
              : isModerator
                ? 'rgba(74,59,107,0.20)'
                : 'rgba(255,255,255,0.08)',
          }}
        >
          <span
            className="font-serif text-white/90 select-none"
            style={{ fontSize: Math.round(avatarSz * 0.44) }}
          >
            {initial}
          </span>
        </div>

        {/* Waveform */}
        {!muted && (
          <div className="mt-1 overflow-hidden" style={{ width: waveW }}>
            <VoiceWaveform speaking={speaking} muted={muted} height={waveH} width={waveW} seed={seed} />
          </div>
        )}

        {/* Name */}
        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-1 px-1">
          <span className="text-[11px] text-white/85 font-medium truncate block">{name}</span>
        </div>

        {/* Moderator badge */}
        {isModerator && (
          <div className="absolute top-2 left-2 bg-htg-indigo/80 rounded-full px-1.5 py-0.5">
            <span className="text-[8px] text-white font-bold">MOD</span>
          </div>
        )}

        {/* Muted badge */}
        {muted && (
          <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Hand raised */}
        {handRaised && (
          <div className="absolute top-2 right-2 bg-htg-warm/80 rounded-full p-1 text-sm leading-none">
            ✋
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Moderator panel ───────────────────────────────────────────────────────
function ModeratorPanel({
  sessionId,
  state,
  onRefresh,
}: {
  sessionId: string;
  state: SessionState;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState('');

  const control = useCallback(async (action: string, payload?: any) => {
    setLoading(action);
    try {
      await fetch(`/api/htg-meeting/session/${sessionId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      onRefresh();
    } finally {
      setLoading('');
    }
  }, [sessionId, onRefresh]);

  const isFreeTalk = state.status === 'free_talk';
  const isWaiting = state.status === 'waiting';

  return (
    <div className="fixed right-4 top-20 z-30 w-72 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4">
      <h3 className="text-sm font-bold text-white/80">Panel moderatora</h3>

      {isWaiting && (
        <button
          onClick={() => control('start')}
          disabled={!!loading}
          className="w-full py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
        >
          {loading === 'start' ? '...' : '▶ Rozpocznij spotkanie'}
        </button>
      )}

      {!isWaiting && state.status !== 'ended' && (
        <>
          {state.currentStage && (
            <div className="bg-white/5 rounded-xl p-3 space-y-1">
              <p className="text-xs text-white/50">Etap</p>
              <p className="text-sm text-white font-medium">{state.currentStage.name}</p>
              {state.currentQuestion && (
                <>
                  <p className="text-xs text-white/50 mt-2">Pytanie</p>
                  <p className="text-sm text-white/80">{state.currentQuestion.question_text}</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => control('skip_speaker')}
              disabled={!!loading || isFreeTalk}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
            >
              <Shuffle className="w-4 h-4" />
              {loading === 'skip_speaker' ? '...' : 'Inna osoba'}
            </button>

            <button
              onClick={() => control('next_question')}
              disabled={!!loading || isFreeTalk}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
              {loading === 'next_question' ? '...' : 'Następne pytanie'}
            </button>

            <button
              onClick={() => control('next_stage')}
              disabled={!!loading || isFreeTalk}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
            >
              <ChevronDown className="w-4 h-4" />
              {loading === 'next_stage' ? '...' : 'Następny etap'}
            </button>

            <button
              onClick={() => control('free_talk')}
              disabled={!!loading}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                isFreeTalk
                  ? 'bg-htg-warm/20 text-htg-warm ring-1 ring-htg-warm/40'
                  : 'bg-white/5 hover:bg-white/10 text-white/70'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              {loading === 'free_talk' ? '...' : isFreeTalk ? 'Wróć do planu' : 'Luźna rozmowa'}
            </button>
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <button
              onClick={() => control('mute_all')}
              disabled={!!loading}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                state.allMuted
                  ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                  : 'bg-white/5 hover:bg-white/10 text-white/70'
              }`}
            >
              {state.allMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {state.allMuted ? 'Odcisz wszystkich' : 'Wycisz wszystkich'}
            </button>

            <div className="space-y-1 max-h-40 overflow-y-auto">
              {state.participants.filter(p => !p.isModerator).map(p => (
                <div key={p.userId} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5">
                  <span className="text-xs text-white/70 truncate flex-1">{p.displayName}</span>
                  <div className="flex items-center gap-1 ml-2">
                    {p.handRaised && <span className="text-xs">✋</span>}
                    <button
                      onClick={() => control('mute_participant', { userId: p.userId })}
                      disabled={!!loading}
                      className={`p-1 rounded-md transition-colors ${p.isMuted ? 'text-red-400 hover:text-red-300' : 'text-white/50 hover:text-white/80'}`}
                    >
                      {p.isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => control('end')}
            disabled={!!loading}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm transition-colors ring-1 ring-red-500/30"
          >
            <PhoneOff className="w-4 h-4" />
            {loading === 'end' ? '...' : 'Zakończ spotkanie'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Inner room (has LiveKit context) ─────────────────────────────────────
function MeetingRoomInner({
  sessionId,
  userId,
  isModerator,
  state,
  onRefresh,
  onLeave,
}: {
  sessionId: string;
  userId: string;
  isModerator: boolean;
  state: SessionState;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const participants = useParticipants();
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [handRaised, setHandRaised] = useState(false);

  // Build participant map: userId → LiveKit participant
  const lkMap = new Map<string, Participant>();
  for (const p of participants) {
    const uid = p.identity.split(':')[0];
    lkMap.set(uid, p);
  }

  // Apply all_muted
  useEffect(() => {
    if (!room) return;
    if (state.allMuted && !isModerator) {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
  }, [state.allMuted, isModerator, room]);

  const toggleMic = () => {
    room.localParticipant.setMicrophoneEnabled(!micOn).catch(() => {});
    setMicOn(!micOn);
  };

  const toggleHand = async () => {
    const next = !handRaised;
    setHandRaised(next);
    await fetch(`/api/htg-meeting/session/${sessionId}/hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: next }),
    }).catch(() => {});
  };

  const isFreeTalk = state.status === 'free_talk';
  const isWaiting = state.status === 'waiting';
  const currentSpeakerId = state.currentSpeakerId;

  const modParticipant = state.participants.find(p => p.userId === state.moderatorId);
  const otherParticipants = state.participants.filter(p => p.userId !== state.moderatorId);

  const spotlightParticipant = currentSpeakerId
    ? state.participants.find(p => p.userId === currentSpeakerId)
    : null;
  const spotlightLK = currentSpeakerId ? lkMap.get(currentSpeakerId) ?? null : null;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-black/60 to-transparent z-10">
        <div className="flex items-center gap-3">
          {state.currentStage && !isFreeTalk && (
            <div className="px-3 py-1 rounded-full bg-htg-indigo/30 border border-htg-indigo/30 text-white/70 text-xs">
              Etap: {state.currentStage.name}
            </div>
          )}
          {isFreeTalk && (
            <div className="px-3 py-1 rounded-full bg-htg-warm/20 border border-htg-warm/30 text-htg-warm text-xs">
              Luźna rozmowa
            </div>
          )}
          {isWaiting && (
            <div className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white/50 text-xs">
              Oczekiwanie na start
            </div>
          )}
        </div>
        <div className="text-white/30 text-xs">HTG Spotkanie</div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 overflow-hidden">
        {/* Question card */}
        {state.currentQuestion && !isFreeTalk && !isWaiting && (
          <div className="bg-black/50 backdrop-blur-md border border-white/15 rounded-2xl px-8 py-4 text-center max-w-lg">
            <p className="text-white/50 text-xs mb-1">Pytanie</p>
            <p className="text-white text-base font-medium leading-relaxed">
              {state.currentQuestion.question_text}
            </p>
            {spotlightParticipant && (
              <p className="text-htg-warm/70 text-xs mt-2">
                odpowiada: {spotlightParticipant.displayName}
              </p>
            )}
          </div>
        )}

        {/* Center spotlight */}
        {spotlightParticipant && !isFreeTalk && (
          <div className="relative">
            <MeetingCircle
              participant={spotlightLK}
              size={SPOTLIGHT_SIZE}
              isCurrentSpeaker={true}
              isModerator={spotlightParticipant.isModerator}
              handRaised={spotlightParticipant.handRaised}
              isMuted={spotlightParticipant.isMuted}
              index={0}
              isSpotlight
            />
            {spotlightParticipant.userId === userId && (
              <button
                onClick={async () => {
                  await fetch(`/api/htg-meeting/session/${sessionId}/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'skip_speaker' }),
                  });
                  onRefresh();
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-colors text-sm font-bold z-10"
                title="Pomiń"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Circle ring */}
        <div className="flex flex-wrap items-center justify-center" style={{ gap: 20, maxWidth: 900 }}>
          {modParticipant && (
            <MeetingCircle
              participant={lkMap.get(modParticipant.userId) ?? null}
              size={MOD_SIZE}
              isCurrentSpeaker={modParticipant.userId === currentSpeakerId && !spotlightParticipant}
              isModerator={true}
              handRaised={modParticipant.handRaised}
              isMuted={modParticipant.isMuted}
              index={0}
            />
          )}

          {otherParticipants.map((p, i) => (
            <MeetingCircle
              key={p.userId}
              participant={lkMap.get(p.userId) ?? null}
              size={PART_SIZE}
              isCurrentSpeaker={p.userId === currentSpeakerId && !spotlightParticipant}
              isModerator={false}
              handRaised={p.handRaised}
              isMuted={p.isMuted}
              index={i + 1}
            />
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 px-6 py-5 bg-gradient-to-t from-black/60 to-transparent">
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors ${
            micOn
              ? 'bg-white/10 hover:bg-white/15 text-white/80'
              : 'bg-red-500/30 hover:bg-red-500/40 text-red-400 ring-1 ring-red-500/40'
          }`}
        >
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {micOn ? 'Mikrofon' : 'Wyciszony'}
        </button>

        <button
          onClick={toggleHand}
          className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors ${
            handRaised
              ? 'bg-htg-warm/20 text-htg-warm ring-1 ring-htg-warm/40'
              : 'bg-white/5 hover:bg-white/10 text-white/50'
          }`}
        >
          <Hand className="w-4 h-4" />
          {handRaised ? 'Opuść rękę' : 'Podnieś rękę'}
        </button>

        <button
          onClick={onLeave}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 ring-1 ring-red-500/30 text-sm font-medium transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          Opuść
        </button>
      </div>

      {isModerator && <ModeratorPanel sessionId={sessionId} state={state} onRefresh={onRefresh} />}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function MeetingRoom({ sessionId, userId, displayName, isModerator, meetingName, locale }: MeetingRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [livekitUrl, setLivekitUrl] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<SessionState | null>(null);
  const stateRef = useRef<SessionState | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`/api/htg-meeting/session/${sessionId}/state`);
      const data = await res.json();
      setState(data);
      stateRef.current = data;
    } catch {}
  }, [sessionId]);

  // Join and get token
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/htg-meeting/session/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Błąd dołączania'); return; }
        setToken(data.token);
        setLivekitUrl(data.url);
      } catch {
        setError('Błąd połączenia');
      }
    })();
  }, [sessionId]);

  // Poll state every 3 seconds
  useEffect(() => {
    loadState();
    const iv = setInterval(loadState, 3000);
    return () => clearInterval(iv);
  }, [loadState]);

  const handleLeave = useCallback(async () => {
    router.push(`/${locale}/konto`);
  }, [locale, router]);

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
        <div className="text-center text-white space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={() => router.push(`/${locale}/konto`)} className="px-6 py-2 rounded-xl bg-htg-sage text-white text-sm">
            Wróć
          </button>
        </div>
      </div>
    );
  }

  if (!token || !state) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-htg-warm border-t-transparent animate-spin mx-auto" />
          <p className="text-white/50 text-sm">{meetingName}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'ended') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
        <div className="text-center space-y-4 text-white">
          <p className="text-xl font-serif">Spotkanie zakończone</p>
          <button onClick={() => router.push(`/${locale}/konto`)} className="px-6 py-2 rounded-xl bg-htg-sage text-white text-sm">
            Wróć do konta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: state.status === 'free_talk' ? '#0e1a0e' : '#0a0e1a' }}
    >
      <SessionAnimation
        variant={state.status === 'free_talk' ? 2 : 1}
        opacity={state.status === 'free_talk' ? 0.3 : 0.4}
        active
      />

      {/* Title */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <span className="text-white/30 text-xs">{meetingName}</span>
      </div>

      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect
        audio
        video={false}
        options={{ audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true } }}
        className="absolute inset-0"
      >
        <RoomAudioRenderer />
        <MeetingRoomInner
          sessionId={sessionId}
          userId={userId}
          isModerator={isModerator}
          state={state}
          onRefresh={loadState}
          onLeave={handleLeave}
        />
      </LiveKitRoom>
    </div>
  );
}
