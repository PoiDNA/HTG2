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
import {
  Mic, MicOff, Hand, PhoneOff,
  ChevronRight, ChevronDown, MessageCircle,
  Volume2, VolumeX, Shuffle, ListOrdered,
  CheckCircle2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface QueueEntry {
  id: string;
  userId: string;
  displayName: string;
  queuedAt: string;
  isCurrent: boolean;
}

interface SessionState {
  status: string;
  moderatorId: string;
  currentSpeakerId: string | null;
  currentStage: { id: string; name: string; order_index: number } | null;
  currentQuestion: { id: string; question_text: string } | null;
  allMuted: boolean;
  queue: QueueEntry[];
  queueSpeakerId: string | null;
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
const PART_SIZE      = 132;  // all ring circles equal — including moderator
const SPOTLIGHT_SIZE = 264;  // center spotlight (current speaker)

// Ring: distance from spotlight center to ring-circle center
const RING_RADIUS  = SPOTLIGHT_SIZE / 2 + PART_SIZE / 2 + 20; // 218px
const MAX_IN_RING  = 8;  // max circles before overflow to row below
const RING_BOX     = 2 * (RING_RADIUS + PART_SIZE / 2);       // 568px

// ─── Helpers ────────────────────────────────────────────────────────────────
function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100) / 10;
}

function floatStyle(seed: number, index: number): React.CSSProperties {
  const duration = 4 + (seed % 3);
  const delay = -(index * 0.7 + seed * 0.4);
  return { animation: `htg-float-${(index % 3) + 1} ${duration}s ease-in-out ${delay}s infinite` };
}

// ─── Participant circle ────────────────────────────────────────────────────
function MeetingCircle({
  participant, size, isCurrentSpeaker, isModerator,
  handRaised, isMuted: dbMuted, index, isSpotlight = false, nameOverride,
}: {
  participant: Participant | null;
  size: number;
  isCurrentSpeaker: boolean;
  isModerator: boolean;
  handRaised: boolean;
  isMuted: boolean;
  index: number;
  isSpotlight?: boolean;
  nameOverride?: string;
}) {
  const speaking   = participant?.isSpeaking ?? false;
  const liveMuted  = participant ? !participant.isMicrophoneEnabled : false;
  const muted      = liveMuted || dbMuted;
  const name       = nameOverride || participant?.name || 'Uczestnik';
  const initial    = name[0]?.toUpperCase() ?? '?';
  const seed       = idSeed(participant?.identity ?? name);
  const waveW      = Math.round(size * 0.65);
  const waveH      = Math.round(size * 0.18);
  const avatarSz   = Math.round(size * 0.35);

  const ringClass = isCurrentSpeaker
    ? 'ring-4 ring-htg-warm shadow-[0_0_60px_15px_rgba(212,167,106,0.40)]'
    : isModerator
      ? 'ring-4 ring-htg-indigo/80 shadow-[0_0_40px_8px_rgba(74,59,107,0.25)]'
      : speaking
        ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_40px_10px_rgba(74,222,128,0.18)]'
        : 'ring-2 ring-white/20';

  const bgStyle: React.CSSProperties = {
    width: size, height: size,
    background: isCurrentSpeaker
      ? 'radial-gradient(circle, rgba(212,167,106,0.20) 0%, #09102a 70%)'
      : isModerator
        ? 'radial-gradient(circle, rgba(74,59,107,0.18) 0%, #0b1124 70%)'
        : speaking
          ? 'radial-gradient(circle, rgba(74,222,128,0.14) 0%, #09102a 65%)'
          : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, #0b1124 70%)',
  };

  return (
    <div className="flex flex-col items-center gap-2" style={isSpotlight ? {} : floatStyle(seed, index)}>
      <div
        className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-2xl
          flex flex-col items-center justify-center transition-all duration-500 ${ringClass}`}
        style={bgStyle}
      >
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: avatarSz, height: avatarSz,
            background: isCurrentSpeaker ? 'rgba(212,167,106,0.25)'
              : isModerator ? 'rgba(74,59,107,0.20)' : 'rgba(255,255,255,0.08)',
          }}
        >
          <span className="font-serif text-white/90 select-none" style={{ fontSize: Math.round(avatarSz * 0.44) }}>
            {initial}
          </span>
        </div>

        {!muted && (
          <div className="mt-1 overflow-hidden" style={{ width: waveW }}>
            <VoiceWaveform speaking={speaking} muted={muted} height={waveH} width={waveW} seed={seed} />
          </div>
        )}

        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-1 px-1">
          <span className="text-[11px] text-white/85 font-medium truncate block">{name}</span>
        </div>

        {isModerator && (
          <div className="absolute top-2 left-2 bg-htg-indigo/80 rounded-full px-1.5 py-0.5">
            <span className="text-[8px] text-white font-bold">MOD</span>
          </div>
        )}
        {muted && (
          <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
        {handRaised && !muted && (
          <div className="absolute top-2 right-2 text-base leading-none">✋</div>
        )}
      </div>
    </div>
  );
}

// ─── Queue panel ──────────────────────────────────────────────────────────
function QueuePanel({
  queue,
  isModerator,
  sessionId,
  onDone,
}: {
  queue: QueueEntry[];
  isModerator: boolean;
  sessionId: string;
  onDone: (userId?: string) => void;
}) {
  if (queue.length === 0) return null;

  return (
    <div className="fixed left-4 top-20 z-30 w-60 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ListOrdered className="w-4 h-4 text-white/50" />
        <h3 className="text-xs font-bold text-white/70 uppercase tracking-wide">Kolejka głosu</h3>
      </div>
      <div className="space-y-1.5">
        {queue.map((entry, i) => (
          <div
            key={entry.id}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all ${
              entry.isCurrent
                ? 'bg-htg-warm/15 border border-htg-warm/30'
                : 'bg-white/5'
            }`}
          >
            <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${entry.isCurrent ? 'text-htg-warm' : 'text-white/30'}`}>
              {entry.isCurrent ? '▶' : `${i + 1}.`}
            </span>
            <span className={`text-sm flex-1 truncate ${entry.isCurrent ? 'text-white font-medium' : 'text-white/60'}`}>
              {entry.displayName}
            </span>
            {/* Moderator can force-done */}
            {isModerator && entry.isCurrent && (
              <button
                onClick={() => onDone(entry.userId)}
                className="text-htg-warm/70 hover:text-htg-warm transition-colors flex-shrink-0"
                title="Zakończ wypowiedź"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/25 mt-3 text-center">
        {queue.length === 1 ? '1 osoba' : `${queue.length} osoby/osób`} w kolejce
      </p>
    </div>
  );
}

// ─── Moderator panel ───────────────────────────────────────────────────────
function ModeratorPanel({
  sessionId, state, onRefresh, onDone,
}: {
  sessionId: string;
  state: SessionState;
  onRefresh: () => void;
  onDone: (userId?: string) => void;
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
  const isWaiting  = state.status === 'waiting';

  return (
    <div className="fixed right-4 top-20 z-30 w-72 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4 max-h-[85vh] overflow-y-auto">
      <h3 className="text-sm font-bold text-white/80">Panel moderatora</h3>

      {isWaiting && (
        <button
          onClick={() => control('start')} disabled={!!loading}
          className="w-full py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
        >
          {loading === 'start' ? '...' : '▶ Rozpocznij spotkanie'}
        </button>
      )}

      {!isWaiting && state.status !== 'ended' && (
        <>
          {/* Current stage/question info */}
          {state.currentStage && (
            <div className="bg-white/5 rounded-xl p-3 space-y-1">
              <p className="text-xs text-white/50">Etap</p>
              <p className="text-sm text-white font-medium">{state.currentStage.name}</p>
              {state.currentQuestion && (
                <>
                  <p className="text-xs text-white/50 mt-2">Pytanie</p>
                  <p className="text-sm text-white/80 leading-relaxed">{state.currentQuestion.question_text}</p>
                </>
              )}
            </div>
          )}

          {/* Queue controls — only in free_talk */}
          {isFreeTalk && state.queueSpeakerId && (
            <div className="bg-htg-warm/10 border border-htg-warm/20 rounded-xl p-3 space-y-2">
              <p className="text-xs text-htg-warm/70">Aktualny mówca w kolejce</p>
              <p className="text-sm text-white font-medium">
                {state.queue.find(q => q.isCurrent)?.displayName ?? '—'}
              </p>
              <button
                onClick={() => onDone(state.queueSpeakerId ?? undefined)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-htg-warm/15 hover:bg-htg-warm/25 text-htg-warm text-sm transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Zakończ wypowiedź
              </button>
            </div>
          )}

          {/* Question flow */}
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
              onClick={() => control('free_talk')} disabled={!!loading}
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

          {/* Mute controls */}
          <div className="border-t border-white/10 pt-3 space-y-2">
            <button
              onClick={() => control('mute_all')} disabled={!!loading}
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
            onClick={() => control('end')} disabled={!!loading}
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

// ─── Ring layout ───────────────────────────────────────────────────────────
// Spotlight circle in center, ring circles arranged radially around it.
// If more than MAX_IN_RING participants, overflow circles appear below.
function CircleRingLayout({
  spotlight,
  ringNodes,
  noSpotlight,
}: {
  spotlight: React.ReactNode | null;
  ringNodes: React.ReactNode[];
  noSpotlight?: boolean;
}) {
  if (noSpotlight || !spotlight) {
    // No active speaker — simple centered flex grid
    return (
      <div className="flex flex-wrap items-center justify-center gap-5 max-w-3xl">
        {ringNodes}
      </div>
    );
  }

  const inRing   = ringNodes.slice(0, MAX_IN_RING);
  const overflow = ringNodes.slice(MAX_IN_RING);
  const N = inRing.length;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Relative container: spotlight in center, ring around */}
      <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flexShrink: 0 }}>
        {/* Center spotlight */}
        <div style={{
          position: 'absolute',
          top:  RING_BOX / 2 - SPOTLIGHT_SIZE / 2,
          left: RING_BOX / 2 - SPOTLIGHT_SIZE / 2,
        }}>
          {spotlight}
        </div>

        {/* Ring circles — evenly distributed around center */}
        {inRing.map((node, i) => {
          const angle = (2 * Math.PI * i) / Math.max(N, 1) - Math.PI / 2; // start from top
          const cx    = RING_BOX / 2 + RING_RADIUS * Math.cos(angle);
          const cy    = RING_BOX / 2 + RING_RADIUS * Math.sin(angle);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: cx - PART_SIZE / 2,
                top:  cy - PART_SIZE / 2,
              }}
            >
              {node}
            </div>
          );
        })}
      </div>

      {/* Overflow row below */}
      {overflow.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {overflow}
        </div>
      )}
    </div>
  );
}

// ─── Inner room (has LiveKit context) ─────────────────────────────────────
function MeetingRoomInner({
  sessionId, userId, isModerator, state, onRefresh, onLeave,
}: {
  sessionId: string;
  userId: string;
  isModerator: boolean;
  state: SessionState;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const participants  = useParticipants();
  const room          = useRoomContext();
  const [micOn, setMicOn]             = useState(true);
  const [handRaised, setHandRaised]   = useState(false);
  const [inQueue, setInQueue]         = useState(false);
  const [doneFlash, setDoneFlash]     = useState<string | null>(null); // name of person who finished
  const prevQueueSpeaker              = useRef<string | null>(null);

  // Build userId → LiveKit participant map (identity = "userId:name")
  const lkMap = new Map<string, Participant>();
  for (const p of participants) {
    const uid = p.identity.split(':')[0];
    lkMap.set(uid, p);
  }

  // Detect when queue speaker changes → show done flash
  useEffect(() => {
    if (!state) return;
    const prev = prevQueueSpeaker.current;
    const curr = state.queueSpeakerId;
    if (prev && prev !== curr) {
      const finishedName = state.queue.find(q => q.userId === prev)?.displayName
        ?? state.participants.find(p => p.userId === prev)?.displayName;
      if (finishedName) {
        setDoneFlash(finishedName);
        setTimeout(() => setDoneFlash(null), 2500);
      }
    }
    prevQueueSpeaker.current = curr;
  }, [state]);

  // Sync inQueue from state
  useEffect(() => {
    if (!state) return;
    const isInQueue = state.queue.some(q => q.userId === userId);
    setInQueue(isInQueue);
  }, [state, userId]);

  // Apply all_muted
  useEffect(() => {
    if (!room || !state) return;
    if (state.allMuted && !isModerator) {
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
  }, [state?.allMuted, isModerator, room]);

  const toggleMic = () => {
    room.localParticipant.setMicrophoneEnabled(!micOn).catch(() => {});
    setMicOn(!micOn);
  };

  const toggleHand = async () => {
    const next = !handRaised;
    setHandRaised(next);
    await fetch(`/api/htg-meeting/session/${sessionId}/hand`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: next }),
    }).catch(() => {});
  };

  const joinQueue = async () => {
    await fetch(`/api/htg-meeting/session/${sessionId}/queue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join' }),
    }).catch(() => {});
    onRefresh();
  };

  const leaveQueue = async () => {
    await fetch(`/api/htg-meeting/session/${sessionId}/queue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave' }),
    }).catch(() => {});
    onRefresh();
  };

  const signalDone = async (targetUserId?: string) => {
    await fetch(`/api/htg-meeting/session/${sessionId}/done`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId }),
    }).catch(() => {});
    onRefresh();
  };

  const isFreeTalk = state.status === 'free_talk';
  const isWaiting  = state.status === 'waiting';

  // Determine spotlight person:
  // — in structured Q&A: randomized current_speaker_id
  // — in free_talk: first in queue
  const structuredSpeakerId = !isFreeTalk ? state.currentSpeakerId : null;
  const queueCurrentSpeakerId = isFreeTalk ? state.queueSpeakerId : null;
  const spotlightUserId = structuredSpeakerId ?? queueCurrentSpeakerId;

  const spotlightParticipant = spotlightUserId
    ? state.participants.find(p => p.userId === spotlightUserId) ?? null
    : null;
  const spotlightLK = spotlightUserId ? lkMap.get(spotlightUserId) ?? null : null;

  const isCurrentQueueSpeaker = queueCurrentSpeakerId === userId;
  const isCurrentQuestionSpeaker = structuredSpeakerId === userId;

  // All participants for ring — everyone equal size (including moderator)
  const ringParticipants = state.participants.filter(p => p.userId !== spotlightUserId);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 z-10
        bg-gradient-to-b from-black/60 to-transparent">
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

      {/* Done flash notification */}
      {doneFlash && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40
          flex items-center gap-2 px-4 py-2 rounded-full
          bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] text-sm
          animate-fade-in">
          <CheckCircle2 className="w-4 h-4" />
          {doneFlash} zakończył/a wypowiedź
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 overflow-hidden">
        {/* Question card — structured mode */}
        {state.currentQuestion && !isFreeTalk && !isWaiting && (
          <div className="bg-black/50 backdrop-blur-md border border-white/15 rounded-2xl px-8 py-4 text-center max-w-xl">
            <p className="text-white/40 text-xs mb-1 uppercase tracking-widest">Pytanie</p>
            <p className="text-white text-lg font-medium leading-relaxed">
              {state.currentQuestion.question_text}
            </p>
            {spotlightParticipant && (
              <p className="text-htg-warm/70 text-xs mt-2">
                odpowiada: <span className="font-semibold">{spotlightParticipant.displayName}</span>
              </p>
            )}
          </div>
        )}

        {/* Free talk info when no queue */}
        {isFreeTalk && !state.queueSpeakerId && state.queue.length === 0 && (
          <div className="text-center space-y-1">
            <p className="text-white/30 text-sm">Wolna rozmowa — klikaj żeby zabrać głos</p>
          </div>
        )}

        {/* Ring layout: current speaker center, everyone else around */}
        <CircleRingLayout
          noSpotlight={!spotlightParticipant}
          spotlight={spotlightParticipant ? (
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
                nameOverride={spotlightParticipant.displayName}
              />
              {isCurrentQuestionSpeaker && !isFreeTalk && (
                <button
                  onClick={async () => {
                    await fetch(`/api/htg-meeting/session/${sessionId}/control`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'skip_speaker' }),
                    });
                    onRefresh();
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70
                    flex items-center justify-center text-white/60 hover:text-white
                    hover:bg-black/90 transition-colors text-base font-bold z-10"
                  title="Pomiń mnie"
                >✕</button>
              )}
              {isCurrentQueueSpeaker && isFreeTalk && (
                <button
                  onClick={() => signalDone()}
                  className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap
                    flex items-center gap-2 px-5 py-2.5 rounded-full
                    bg-[#4ade80]/15 hover:bg-[#4ade80]/25 text-[#4ade80]
                    ring-1 ring-[#4ade80]/40 text-sm font-medium transition-colors z-10"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Zakończyłem/am wypowiedź
                </button>
              )}
            </div>
          ) : null}
          ringNodes={ringParticipants.map((p, i) => (
            <MeetingCircle
              key={p.userId}
              participant={lkMap.get(p.userId) ?? null}
              size={PART_SIZE}
              isCurrentSpeaker={false}
              isModerator={p.isModerator}
              handRaised={p.handRaised}
              isMuted={p.isMuted}
              index={i}
              nameOverride={p.displayName}
            />
          ))}
        />
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 flex items-center justify-center flex-wrap gap-3 px-6 py-4
        bg-gradient-to-t from-black/60 to-transparent">
        {/* Mic */}
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors ${
            micOn ? 'bg-white/10 hover:bg-white/15 text-white/80'
              : 'bg-red-500/30 hover:bg-red-500/40 text-red-400 ring-1 ring-red-500/40'
          }`}
        >
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {micOn ? 'Mikrofon' : 'Wyciszony'}
        </button>

        {/* Raise hand — structured mode */}
        {!isFreeTalk && (
          <button
            onClick={toggleHand}
            className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors ${
              handRaised ? 'bg-htg-warm/20 text-htg-warm ring-1 ring-htg-warm/40'
                : 'bg-white/5 hover:bg-white/10 text-white/50'
            }`}
          >
            <Hand className="w-4 h-4" />
            {handRaised ? 'Opuść rękę' : 'Podnieś rękę'}
          </button>
        )}

        {/* Queue button — free talk mode */}
        {isFreeTalk && (
          inQueue ? (
            <button
              onClick={leaveQueue}
              className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors
                bg-htg-warm/20 text-htg-warm ring-1 ring-htg-warm/40"
            >
              <ListOrdered className="w-4 h-4" />
              Opuść kolejkę
            </button>
          ) : (
            <button
              onClick={joinQueue}
              className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors
                bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage ring-1 ring-htg-sage/40"
            >
              <Hand className="w-4 h-4" />
              Chcę zabrać głos
            </button>
          )
        )}

        {/* Leave */}
        <button
          onClick={onLeave}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30
            text-red-400 ring-1 ring-red-500/30 text-sm font-medium transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          Opuść
        </button>
      </div>

      {/* Queue panel (left side — free talk with active queue) */}
      {(isFreeTalk || state.queue.length > 0) && (
        <QueuePanel
          queue={state.queue}
          isModerator={isModerator}
          sessionId={sessionId}
          onDone={signalDone}
        />
      )}

      {/* Moderator panel */}
      {isModerator && (
        <ModeratorPanel sessionId={sessionId} state={state} onRefresh={onRefresh} onDone={signalDone} />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function MeetingRoom({
  sessionId, userId, displayName, isModerator, meetingName, locale,
}: MeetingRoomProps) {
  const router = useRouter();
  const [token, setToken]           = useState('');
  const [livekitUrl, setLivekitUrl] = useState('');
  const [error, setError]           = useState('');
  const [state, setState]           = useState<SessionState | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res  = await fetch(`/api/htg-meeting/session/${sessionId}/state`);
      const data = await res.json();
      setState(data);
    } catch {}
  }, [sessionId]);

  // Get LiveKit token
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/htg-meeting/session/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const handleLeave = useCallback(() => {
    router.push(`/${locale}/konto`);
  }, [locale, router]);

  if (error) return (
    <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
      <div className="text-center text-white space-y-4">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push(`/${locale}/konto`)} className="px-6 py-2 rounded-xl bg-htg-sage text-white text-sm">Wróć</button>
      </div>
    </div>
  );

  if (!token || !state) return (
    <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-htg-warm border-t-transparent animate-spin mx-auto" />
        <p className="text-white/50 text-sm">{meetingName}</p>
      </div>
    </div>
  );

  if (state.status === 'ended') return (
    <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
      <div className="text-center space-y-4 text-white">
        <p className="text-xl font-serif">Spotkanie zakończone</p>
        <button onClick={() => router.push(`/${locale}/konto`)} className="px-6 py-2 rounded-xl bg-htg-sage text-white text-sm">
          Wróć do konta
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background: state.status === 'free_talk' ? '#0b170b' : '#0a0e1a' }}>
      <SessionAnimation
        variant={state.status === 'free_talk' ? 2 : 1}
        opacity={state.status === 'free_talk' ? 0.25 : 0.40}
        active
      />

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <span className="text-white/25 text-xs">{meetingName}</span>
      </div>

      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect audio video={false}
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
