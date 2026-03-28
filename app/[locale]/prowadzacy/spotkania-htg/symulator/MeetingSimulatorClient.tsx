'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import SessionAnimation from '@/components/live/SessionAnimation';
import { SimVoiceWaveform } from '@/components/live/AudioWaveTile';
import {
  Mic, MicOff, Hand, PhoneOff,
  ChevronRight, ChevronDown, MessageCircle,
  Volume2, VolumeX, Shuffle, ListOrdered, CheckCircle2, Play,
} from 'lucide-react';

// ─── Mock data ─────────────────────────────────────────────────────────────
const MOCK_PARTICIPANTS = [
  { userId: 'mod-1',  displayName: 'Natalia HTG',  isModerator: true  },
  { userId: 'p-1',    displayName: 'Anna K.',       isModerator: false },
  { userId: 'p-2',    displayName: 'Piotr W.',      isModerator: false },
  { userId: 'p-3',    displayName: 'Ewa M.',        isModerator: false },
  { userId: 'p-4',    displayName: 'Marek Z.',      isModerator: false },
  { userId: 'p-5',    displayName: 'Joanna L.',     isModerator: false },
];

const MOCK_STAGES = [
  {
    id: 's-1', name: 'Intro — Kto jestem', order_index: 0,
    questions: [
      { id: 'q-1', question_text: 'Przedstaw się i powiedz, co Cię przyprowadziło na to spotkanie.' },
      { id: 'q-2', question_text: 'Jakie jest jedno słowo opisujące Twój stan na ten moment?' },
    ],
  },
  {
    id: 's-2', name: 'Refleksja — Moja zmiana', order_index: 1,
    questions: [
      { id: 'q-3', question_text: 'Opisz jedną znaczącą zmianę, którą ostatnio w sobie zauważyłeś/aś.' },
      { id: 'q-4', question_text: 'Co było najtrudniejsze w tej zmianie?' },
    ],
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────
type SimStatus = 'waiting' | 'active' | 'free_talk';

interface SimQueueEntry {
  userId: string;
  displayName: string;
  isCurrent: boolean;
}

interface SimState {
  status: SimStatus;
  currentStageIdx: number;
  currentQuestionIdx: number;
  currentSpeakerId: string | null;
  queue: SimQueueEntry[];
  allMuted: boolean;
  mutedIds: Set<string>;
  speakingIdx: number; // rotates for animation
}

// ─── Constants ───────────────────────────────────────────────────────────────
const PART_SIZE      = 132;
const SPOTLIGHT_SIZE = 264;
const RING_RADIUS    = SPOTLIGHT_SIZE / 2 + PART_SIZE / 2 + 20; // 218px
const MAX_IN_RING    = 8;
const RING_BOX       = 2 * (RING_RADIUS + PART_SIZE / 2); // 568px

// ─── Helpers ─────────────────────────────────────────────────────────────────
function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100) / 10;
}

function floatStyle(seed: number, index: number): React.CSSProperties {
  const duration = 4 + (seed % 3);
  const delay    = -(index * 0.7 + seed * 0.4);
  return { animation: `htg-float-${(index % 3) + 1} ${duration}s ease-in-out ${delay}s infinite` };
}

function pickRandom(arr: string[], exclude?: string | null): string {
  const pool = arr.filter(id => id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? arr[0];
}

// ─── Sim Circle ──────────────────────────────────────────────────────────────
function SimCircle({
  participant, size, isCurrentSpeaker, isModerator, isMuted,
  inQueue, isQueueCurrent, index, isSpotlight = false,
}: {
  participant: { userId: string; displayName: string; isModerator: boolean };
  size: number;
  isCurrentSpeaker: boolean;
  isModerator: boolean;
  isMuted: boolean;
  inQueue: boolean;
  isQueueCurrent: boolean;
  index: number;
  isSpotlight?: boolean;
}) {
  const name     = participant.displayName;
  const initial  = name[0]?.toUpperCase() ?? '?';
  const seed     = idSeed(participant.userId);
  const speaking = isCurrentSpeaker || isQueueCurrent;
  const waveW    = Math.round(size * 0.65);
  const waveH    = Math.round(size * 0.18);
  const avatarSz = Math.round(size * 0.35);

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

        {!isMuted && (
          <div className="mt-1 overflow-hidden" style={{ width: waveW }}>
            <SimVoiceWaveform speaking={speaking} height={waveH} width={waveW} seed={seed} />
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
        {isMuted && (
          <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
        {inQueue && !isQueueCurrent && (
          <div className="absolute top-2 right-2 bg-htg-sage/70 rounded-full px-1.5 py-0.5">
            <span className="text-[8px] text-white font-bold">✋</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ring layout ─────────────────────────────────────────────────────────────
function SimRingLayout({
  spotlight, ringNodes, noSpotlight,
}: {
  spotlight: React.ReactNode | null;
  ringNodes: React.ReactNode[];
  noSpotlight?: boolean;
}) {
  if (noSpotlight || !spotlight) {
    return <div className="flex flex-wrap items-center justify-center gap-5 max-w-3xl">{ringNodes}</div>;
  }
  const inRing   = ringNodes.slice(0, MAX_IN_RING);
  const overflow = ringNodes.slice(MAX_IN_RING);
  const N = inRing.length;
  return (
    <div className="flex flex-col items-center gap-4">
      <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flexShrink: 0 }}>
        <div style={{
          position: 'absolute',
          top:  RING_BOX / 2 - SPOTLIGHT_SIZE / 2,
          left: RING_BOX / 2 - SPOTLIGHT_SIZE / 2,
        }}>
          {spotlight}
        </div>
        {inRing.map((node, i) => {
          const angle = (2 * Math.PI * i) / Math.max(N, 1) - Math.PI / 2;
          const cx    = RING_BOX / 2 + RING_RADIUS * Math.cos(angle);
          const cy    = RING_BOX / 2 + RING_RADIUS * Math.sin(angle);
          return (
            <div key={i} style={{ position: 'absolute', left: cx - PART_SIZE / 2, top: cy - PART_SIZE / 2 }}>
              {node}
            </div>
          );
        })}
      </div>
      {overflow.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4">{overflow}</div>
      )}
    </div>
  );
}

// ─── Main simulator ──────────────────────────────────────────────────────────
export default function MeetingSimulatorClient() {
  const nonModIds = MOCK_PARTICIPANTS.filter(p => !p.isModerator).map(p => p.userId);

  const [sim, setSim] = useState<SimState>({
    status: 'waiting',
    currentStageIdx: 0,
    currentQuestionIdx: 0,
    currentSpeakerId: null,
    queue: [],
    allMuted: false,
    mutedIds: new Set(),
    speakingIdx: 0,
  });

  const [doneFlash, setDoneFlash] = useState<string | null>(null);
  const prevQueueSpeaker = useRef<string | null>(null);

  // Rotate speaking animation
  useEffect(() => {
    const iv = setInterval(() => {
      setSim(s => ({ ...s, speakingIdx: (s.speakingIdx + 1) % MOCK_PARTICIPANTS.length }));
    }, 3800);
    return () => clearInterval(iv);
  }, []);

  // Detect queue speaker changes
  useEffect(() => {
    const curr = sim.queue.find(q => q.isCurrent)?.userId ?? null;
    if (prevQueueSpeaker.current && prevQueueSpeaker.current !== curr) {
      const finishedName = MOCK_PARTICIPANTS.find(p => p.userId === prevQueueSpeaker.current)?.displayName;
      if (finishedName) {
        setDoneFlash(finishedName);
        setTimeout(() => setDoneFlash(null), 2500);
      }
    }
    prevQueueSpeaker.current = curr;
  }, [sim.queue]);

  const currentStage    = MOCK_STAGES[sim.currentStageIdx];
  const currentQuestion = currentStage?.questions[sim.currentQuestionIdx] ?? null;
  const isFreeTalk      = sim.status === 'free_talk';
  const isWaiting       = sim.status === 'waiting';

  // Spotlight: structured speaker or queue speaker
  const spotlightUserId = !isFreeTalk
    ? sim.currentSpeakerId
    : (sim.queue.find(q => q.isCurrent)?.userId ?? null);

  const spotlightParticipant = spotlightUserId
    ? MOCK_PARTICIPANTS.find(p => p.userId === spotlightUserId) ?? null
    : null;

  // Controls
  const start = () => {
    const speaker = pickRandom(nonModIds, null);
    setSim(s => ({ ...s, status: 'active', currentSpeakerId: speaker }));
  };

  const nextQuestion = () => {
    setSim(s => {
      const stage = MOCK_STAGES[s.currentStageIdx];
      const nextQIdx = s.currentQuestionIdx + 1;
      if (nextQIdx < stage.questions.length) {
        return { ...s, currentQuestionIdx: nextQIdx, currentSpeakerId: pickRandom(nonModIds, s.currentSpeakerId) };
      }
      // next stage
      const nextSIdx = s.currentStageIdx + 1;
      if (nextSIdx < MOCK_STAGES.length) {
        return { ...s, currentStageIdx: nextSIdx, currentQuestionIdx: 0, currentSpeakerId: pickRandom(nonModIds, s.currentSpeakerId) };
      }
      return { ...s, status: 'free_talk', currentSpeakerId: null };
    });
  };

  const nextStage = () => {
    setSim(s => {
      const nextSIdx = s.currentStageIdx + 1;
      if (nextSIdx < MOCK_STAGES.length) {
        return { ...s, currentStageIdx: nextSIdx, currentQuestionIdx: 0, currentSpeakerId: pickRandom(nonModIds, s.currentSpeakerId) };
      }
      return { ...s, status: 'free_talk', currentSpeakerId: null };
    });
  };

  const skipSpeaker = () => {
    setSim(s => ({ ...s, currentSpeakerId: pickRandom(nonModIds, s.currentSpeakerId) }));
  };

  const toggleFreeTalk = () => {
    setSim(s => ({ ...s, status: s.status === 'free_talk' ? 'active' : 'free_talk', currentSpeakerId: null }));
  };

  const toggleMuteAll = () => {
    setSim(s => ({ ...s, allMuted: !s.allMuted }));
  };

  const toggleMuteParticipant = (userId: string) => {
    setSim(s => {
      const next = new Set(s.mutedIds);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return { ...s, mutedIds: next };
    });
  };

  const joinQueue = (userId: string) => {
    setSim(s => {
      if (s.queue.some(q => q.userId === userId)) return s;
      const name = MOCK_PARTICIPANTS.find(p => p.userId === userId)?.displayName ?? 'Uczestnik';
      const newQueue = [...s.queue, { userId, displayName: name, isCurrent: false }];
      // mark first as current
      return { ...s, queue: newQueue.map((q, i) => ({ ...q, isCurrent: i === 0 })) };
    });
  };

  const signalDone = (userId?: string) => {
    setSim(s => {
      const targetId = userId ?? s.queue.find(q => q.isCurrent)?.userId;
      const remaining = s.queue.filter(q => q.userId !== targetId);
      return { ...s, queue: remaining.map((q, i) => ({ ...q, isCurrent: i === 0 })) };
    });
  };

  // Ring: all participants except spotlight person (everyone equal size)
  const ringParticipants = MOCK_PARTICIPANTS.filter(p => p.userId !== spotlightParticipant?.userId);
  const otherParticipants = MOCK_PARTICIPANTS.filter(p => !p.isModerator); // used for mod panel only

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: isFreeTalk ? '#0b170b' : '#0a0e1a' }}>
      <SessionAnimation variant={isFreeTalk ? 2 : 1} opacity={isFreeTalk ? 0.25 : 0.40} active />

      {/* Title */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        <span className="text-white/25 text-xs">Symulator spotkania HTG</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-htg-warm/20 text-htg-warm">DEMO</span>
      </div>

      {/* Top bar */}
      <div className="absolute top-10 inset-x-0 z-10 flex items-center justify-center gap-3 px-6 py-3">
        {!isWaiting && currentStage && !isFreeTalk && (
          <div className="px-3 py-1 rounded-full bg-htg-indigo/30 border border-htg-indigo/30 text-white/70 text-xs">
            Etap: {currentStage.name}
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

      {/* Done flash */}
      {doneFlash && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40
          flex items-center gap-2 px-4 py-2 rounded-full
          bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {doneFlash} zakończył/a wypowiedź
        </div>
      )}

      {/* Main area */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 pt-24 pb-24">
        {/* Question card */}
        {currentQuestion && !isFreeTalk && !isWaiting && (
          <div className="bg-black/50 backdrop-blur-md border border-white/15 rounded-2xl px-8 py-4 text-center max-w-xl z-10">
            <p className="text-white/40 text-xs mb-1 uppercase tracking-widest">Pytanie</p>
            <p className="text-white text-lg font-medium leading-relaxed">{currentQuestion.question_text}</p>
            {spotlightParticipant && (
              <p className="text-htg-warm/70 text-xs mt-2">
                odpowiada: <span className="font-semibold">{spotlightParticipant.displayName}</span>
              </p>
            )}
          </div>
        )}

        {isFreeTalk && !spotlightParticipant && (
          <p className="text-white/25 text-sm">Kliknij uczestnika w panelu moderatora żeby dodać do kolejki</p>
        )}

        {/* Ring layout — spotlight center, everyone else around */}
        <SimRingLayout
          noSpotlight={!spotlightParticipant}
          spotlight={spotlightParticipant ? (
            <div className="relative">
              <SimCircle
                participant={spotlightParticipant}
                size={SPOTLIGHT_SIZE}
                isCurrentSpeaker={!isFreeTalk}
                isModerator={spotlightParticipant.isModerator}
                isMuted={sim.allMuted || sim.mutedIds.has(spotlightParticipant.userId)}
                inQueue={sim.queue.some(q => q.userId === spotlightParticipant.userId)}
                isQueueCurrent={isFreeTalk}
                index={0}
                isSpotlight
              />
              {isFreeTalk && sim.queue.find(q => q.isCurrent)?.userId === spotlightParticipant.userId && (
                <button
                  onClick={() => signalDone()}
                  className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap
                    flex items-center gap-2 px-5 py-2.5 rounded-full
                    bg-[#4ade80]/15 hover:bg-[#4ade80]/25 text-[#4ade80]
                    ring-1 ring-[#4ade80]/40 text-sm font-medium transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Zakończyłem/am wypowiedź
                </button>
              )}
              {!isFreeTalk && spotlightParticipant.userId === sim.currentSpeakerId && (
                <button
                  onClick={skipSpeaker}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70
                    flex items-center justify-center text-white/60 hover:text-white
                    hover:bg-black/90 transition-colors text-base font-bold z-10"
                >✕</button>
              )}
            </div>
          ) : null}
          ringNodes={ringParticipants.map((p, i) => (
            <SimCircle
              key={p.userId}
              participant={p}
              size={PART_SIZE}
              isCurrentSpeaker={false}
              isModerator={p.isModerator}
              isMuted={sim.allMuted || sim.mutedIds.has(p.userId)}
              inQueue={sim.queue.some(q => q.userId === p.userId)}
              isQueueCurrent={sim.queue.find(q => q.isCurrent)?.userId === p.userId}
              index={i}
            />
          ))}
        />
      </div>

      {/* Bottom controls — participant view */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-center flex-wrap gap-3 px-6 py-4
        bg-gradient-to-t from-black/60 to-transparent z-10">
        <button className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 text-white/80 text-sm">
          <Mic className="w-4 h-4" /> Mikrofon
        </button>
        {isFreeTalk ? (
          <button
            onClick={() => joinQueue('p-1')}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage ring-1 ring-htg-sage/40 text-sm"
          >
            <Hand className="w-4 h-4" /> Chcę zabrać głos (Anna K.)
          </button>
        ) : (
          <button className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/5 text-white/50 text-sm">
            <Hand className="w-4 h-4" /> Podnieś rękę
          </button>
        )}
        <button className="flex items-center gap-2 px-5 py-3 rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/30 text-sm">
          <PhoneOff className="w-4 h-4" /> Opuść
        </button>
      </div>

      {/* Queue panel (left) */}
      {sim.queue.length > 0 && (
        <div className="fixed left-4 top-20 z-30 w-60 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListOrdered className="w-4 h-4 text-white/50" />
            <h3 className="text-xs font-bold text-white/70 uppercase tracking-wide">Kolejka głosu</h3>
          </div>
          <div className="space-y-1.5">
            {sim.queue.map((entry, i) => (
              <div
                key={entry.userId}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl ${
                  entry.isCurrent ? 'bg-htg-warm/15 border border-htg-warm/30' : 'bg-white/5'
                }`}
              >
                <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${entry.isCurrent ? 'text-htg-warm' : 'text-white/30'}`}>
                  {entry.isCurrent ? '▶' : `${i + 1}.`}
                </span>
                <span className={`text-sm flex-1 truncate ${entry.isCurrent ? 'text-white font-medium' : 'text-white/60'}`}>
                  {entry.displayName}
                </span>
                {entry.isCurrent && (
                  <button
                    onClick={() => signalDone(entry.userId)}
                    className="text-htg-warm/70 hover:text-htg-warm transition-colors flex-shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moderator panel (right) */}
      <div className="fixed right-4 top-20 z-30 w-72 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-white/80">Panel moderatora — SYMULATOR</h3>

        {isWaiting && (
          <button
            onClick={start}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80"
          >
            <Play className="w-4 h-4" /> Rozpocznij spotkanie
          </button>
        )}

        {!isWaiting && (
          <>
            {currentStage && !isFreeTalk && (
              <div className="bg-white/5 rounded-xl p-3 space-y-1">
                <p className="text-xs text-white/50">Etap</p>
                <p className="text-sm text-white font-medium">{currentStage.name}</p>
                {currentQuestion && (
                  <>
                    <p className="text-xs text-white/50 mt-2">Pytanie</p>
                    <p className="text-sm text-white/80">{currentQuestion.question_text}</p>
                  </>
                )}
              </div>
            )}

            {isFreeTalk && (
              <div className="bg-white/5 rounded-xl p-3 space-y-2">
                <p className="text-xs text-white/50">Dodaj do kolejki:</p>
                {otherParticipants.filter(p => !sim.queue.some(q => q.userId === p.userId)).map(p => (
                  <button
                    key={p.userId}
                    onClick={() => joinQueue(p.userId)}
                    className="w-full text-left px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 hover:text-white transition-colors"
                  >
                    + {p.displayName}
                  </button>
                ))}
                {sim.queue.find(q => q.isCurrent) && (
                  <button
                    onClick={() => signalDone()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-htg-warm/15 hover:bg-htg-warm/25 text-htg-warm text-sm transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Zakończ wypowiedź (moderator)
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={skipSpeaker} disabled={isFreeTalk}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
              >
                <Shuffle className="w-4 h-4" /> Inna osoba
              </button>
              <button
                onClick={nextQuestion} disabled={isFreeTalk}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" /> Następne pytanie
              </button>
              <button
                onClick={nextStage} disabled={isFreeTalk}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors disabled:opacity-40"
              >
                <ChevronDown className="w-4 h-4" /> Następny etap
              </button>
              <button
                onClick={toggleFreeTalk}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  isFreeTalk ? 'bg-htg-warm/20 text-htg-warm ring-1 ring-htg-warm/40' : 'bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                {isFreeTalk ? 'Wróć do planu' : 'Luźna rozmowa'}
              </button>
            </div>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <button
                onClick={toggleMuteAll}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  sim.allMuted ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40' : 'bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                {sim.allMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {sim.allMuted ? 'Odcisz wszystkich' : 'Wycisz wszystkich'}
              </button>
              {otherParticipants.map(p => (
                <div key={p.userId} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5">
                  <span className="text-xs text-white/70 truncate flex-1">{p.displayName}</span>
                  <button
                    onClick={() => toggleMuteParticipant(p.userId)}
                    className={`p-1 rounded-md transition-colors ml-2 ${sim.mutedIds.has(p.userId) ? 'text-red-400' : 'text-white/50 hover:text-white/80'}`}
                  >
                    {sim.mutedIds.has(p.userId) ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
