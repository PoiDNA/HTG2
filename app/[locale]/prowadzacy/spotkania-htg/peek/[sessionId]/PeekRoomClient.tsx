'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import SessionAnimation from '@/components/live/SessionAnimation';
import { VoiceWaveform } from '@/components/live/AudioWaveTile';
import { Eye, X, Users2, MessageCircle, Volume2 } from 'lucide-react';

// ── Types (mirrors MeetingRoom) ──────────────────────────────────────────────
interface QueueEntry {
  id: string;
  userId: string;
  displayName: string;
  isCurrent: boolean;
}

interface SessionState {
  status: string;
  moderatorId: string;
  currentSpeakerId: string | null;
  currentStage: { id: string; name: string } | null;
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

// ── Constants ────────────────────────────────────────────────────────────────
const PART_SIZE      = 132;
const SPOTLIGHT_SIZE = 264;
const RING_RADIUS    = SPOTLIGHT_SIZE / 2 + PART_SIZE / 2 + 20;
const MAX_IN_RING    = 8;
const RING_BOX       = 2 * (RING_RADIUS + PART_SIZE / 2);

// ── Helpers ──────────────────────────────────────────────────────────────────
function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100) / 10;
}

function floatStyle(seed: number, index: number): React.CSSProperties {
  const duration = 8 + (seed % 5);
  const delay    = -(index * 1.4 + seed * 0.8);
  return { animation: `htg-float-${(index % 3) + 1} ${duration}s ease-in-out ${delay}s infinite` };
}

// ── Peek circle (read-only, no controls) ────────────────────────────────────
function PeekCircle({
  participant, size, isCurrentSpeaker, isModerator,
  handRaised, isMuted, index, isSpotlight = false, nameOverride,
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
  const speaking  = participant?.isSpeaking ?? false;
  const muted     = isMuted || (participant ? !participant.isMicrophoneEnabled : false);
  const name      = nameOverride || participant?.name || 'Uczestnik';
  const initial   = name[0]?.toUpperCase() ?? '?';
  const seed      = idSeed(participant?.identity ?? name);
  const waveW     = Math.round(size * 0.65);
  const waveH     = Math.round(size * 0.18);
  const avatarSz  = Math.round(size * 0.35);

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
            <VoiceWaveform speaking={speaking || isCurrentSpeaker} muted={muted} height={waveH} width={waveW} seed={seed} />
          </div>
        )}

        {handRaised && (
          <div className="absolute top-1 left-1 text-sm">✋</div>
        )}
        {isModerator && (
          <div className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full
            bg-htg-indigo/40 text-white/70 font-medium">MOD</div>
        )}
      </div>
      <span className="text-xs text-white/60 font-medium text-center max-w-[112px] truncate">
        {name}
      </span>
    </div>
  );
}

// ── Ring layout ──────────────────────────────────────────────────────────────
function PeekRingLayout({
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

// ── Inner observer room (has LiveKit context) ────────────────────────────────
function PeekInner({
  sessionId, onExit,
}: {
  sessionId: string;
  onExit: () => void;
}) {
  const [state, setState]   = useState<SessionState | null>(null);
  const lkParticipants      = useParticipants();

  // Poll meeting state every 3s
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/htg-meeting/session/${sessionId}/state`);
    if (res.ok) setState(await res.json());
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Map LK participants by userId (exclude __obs__ identities)
  const lkMap = useMemo(() => {
    const m = new Map<string, Participant>();
    for (const p of lkParticipants) {
      if (p.identity.startsWith('__obs__')) continue;
      const uid = p.identity.split(':')[0];
      m.set(uid, p);
    }
    return m;
  }, [lkParticipants]);

  if (!state) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-8 h-8 rounded-full border-2 border-htg-warm border-t-transparent animate-spin" />
      </div>
    );
  }

  const isFreeTalk     = state.status === 'free_talk';
  const spotlightId    = isFreeTalk ? state.queueSpeakerId : state.currentSpeakerId;
  const spotlightP     = state.participants.find(p => p.userId === spotlightId) ?? null;
  const ringParticipants = state.participants.filter(p => p.userId !== spotlightId);

  const liveCount = lkParticipants.filter(p => !p.identity.startsWith('__obs__')).length;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: isFreeTalk ? '#0b170b' : '#0a0e1a' }}>
      <SessionAnimation variant={isFreeTalk ? 2 : 1} opacity={isFreeTalk ? 0.20 : 0.35} active />
      <RoomAudioRenderer />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="relative z-20 flex items-center justify-between px-6 py-4
        bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-3">
          {/* PODGLĄD badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
            bg-htg-warm/15 border border-htg-warm/30">
            <Eye className="w-3.5 h-3.5 text-htg-warm" />
            <span className="text-[11px] text-htg-warm font-semibold tracking-wide">PODGLĄD LIVE</span>
          </div>
          <span className="text-white/30 text-xs">
            Uczestnicy nie widzą Twojej obecności
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Live participant count */}
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Users2 className="w-3.5 h-3.5" />
            {liveCount} online
          </div>
          {/* Audio indicator */}
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Volume2 className="w-3.5 h-3.5" />
            Słyszysz
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 rounded-full
              bg-white/8 hover:bg-white/14 text-white/70 hover:text-white
              text-sm font-medium transition-colors"
          >
            <X className="w-4 h-4" />
            Wyjdź
          </button>
        </div>
      </div>

      {/* ── Stage / Question info ────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-2 pt-2 pb-0 px-4">
        {state.currentStage && (
          <div className="text-xs text-white/40 font-medium tracking-widest uppercase">
            {state.currentStage.name}
          </div>
        )}
        {state.currentQuestion && !isFreeTalk && (
          <div className="max-w-2xl px-6 py-3 rounded-2xl bg-htg-warm/10 border border-htg-warm/20 text-center">
            <MessageCircle className="w-4 h-4 text-htg-warm/60 mx-auto mb-1" />
            <p className="text-white text-base font-medium leading-relaxed">
              {state.currentQuestion.question_text}
            </p>
            {spotlightP && (
              <p className="text-htg-warm/60 text-xs mt-1.5">
                odpowiada: <span className="font-semibold text-htg-warm/80">{spotlightP.displayName}</span>
              </p>
            )}
          </div>
        )}
        {isFreeTalk && (
          <div className="px-4 py-1.5 rounded-full bg-[#1a2e1a]/60 border border-[#4ade80]/15
            text-[#4ade80]/60 text-xs">
            Luźna rozmowa
          </div>
        )}
      </div>

      {/* ── Circle ring ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-8 overflow-hidden">
        <PeekRingLayout
          noSpotlight={!spotlightP}
          spotlight={spotlightP ? (
            <PeekCircle
              participant={lkMap.get(spotlightP.userId) ?? null}
              size={SPOTLIGHT_SIZE}
              isCurrentSpeaker
              isModerator={spotlightP.isModerator}
              handRaised={spotlightP.handRaised}
              isMuted={spotlightP.isMuted}
              index={0}
              isSpotlight
              nameOverride={spotlightP.displayName}
            />
          ) : null}
          ringNodes={ringParticipants.map((p, i) => (
            <PeekCircle
              key={p.userId}
              participant={lkMap.get(p.userId) ?? null}
              size={PART_SIZE}
              isCurrentSpeaker={false}
              isModerator={p.isModerator}
              handRaised={p.handRaised}
              isMuted={state.allMuted || p.isMuted}
              index={i}
              nameOverride={p.displayName}
            />
          ))}
        />
      </div>

      {/* ── Queue strip (if any) ─────────────────────────────────────────── */}
      {isFreeTalk && state.queue.length > 0 && (
        <div className="relative z-20 flex items-center justify-center gap-2 pb-4 flex-shrink-0">
          {state.queue.map((q, i) => (
            <div
              key={q.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${q.isCurrent
                  ? 'bg-[#4ade80]/20 border border-[#4ade80]/40 text-[#4ade80]'
                  : 'bg-white/5 border border-white/10 text-white/40'
                }`}
            >
              <span className="opacity-50">{i + 1}.</span>
              {q.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root component — fetches token, wraps LiveKitRoom ────────────────────────
export default function PeekRoomClient({
  sessionId, meetingName, locale, backUrl,
}: {
  sessionId: string;
  meetingName: string;
  locale: string;
  backUrl: string;
}) {
  const router   = useRouter();
  const [token,  setToken]  = useState<string | null>(null);
  const [url,    setUrl]    = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/htg-meeting/session/${sessionId}/peek-token`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? 'Błąd autoryzacji');
          return;
        }
        const d = await res.json();
        setToken(d.token);
        setUrl(d.url);
      } catch {
        setError('Nie można połączyć z serwerem');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const handleExit = useCallback(() => router.push(backUrl), [router, backUrl]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-htg-warm border-t-transparent animate-spin" />
          <p className="text-white/40 text-sm">Łączenie z podglądem…</p>
        </div>
      </div>
    );
  }

  if (error || !token || !url) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <p className="text-red-400/80 mb-4">{error ?? 'Brak dostępu'}</p>
          <button onClick={handleExit} className="px-5 py-2.5 rounded-full bg-white/8 text-white/60 text-sm hover:bg-white/14 transition-colors">
            Wróć
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      audio
      video={false}
      connect
      onDisconnected={handleExit}
    >
      <PeekInner sessionId={sessionId} onExit={handleExit} />
    </LiveKitRoom>
  );
}
