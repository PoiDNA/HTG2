'use client';

import { useState, useEffect, useCallback } from 'react';
import SessionAnimation from '@/components/live/SessionAnimation';
import PhaseTransition from '@/components/live/PhaseTransition';
import { Waveform } from '@/components/live/AudioWaveTile';
import {
  Play, SkipForward, Coffee, Square, CoffeeIcon,
  Mic, MicOff, Video, VideoOff, Monitor,
  Eye, User, ChevronRight, Clock, CheckCircle2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type SimPhase =
  | 'poczekalnia'
  | 'wstep'
  | 'przejscie_1'
  | 'sesja'
  | 'przejscie_2'
  | 'podsumowanie'
  | 'outro'
  | 'ended';

type ViewMode = 'user' | 'staff';

interface MockParticipant {
  name: string;
  identity: string;
  isLocal: boolean;
  isStaff: boolean;
  isMicrophoneEnabled: boolean;
  isSpeaking: boolean;
  role?: 'practitioner' | 'assistant' | 'client';
}

// ─── Phase config ─────────────────────────────────────────────────────────────

const PHASE_ORDER: SimPhase[] = [
  'poczekalnia', 'wstep', 'przejscie_1', 'sesja',
  'przejscie_2', 'podsumowanie', 'outro', 'ended',
];

const PHASE_LABELS: Record<SimPhase, string> = {
  poczekalnia: 'Poczekalnia',
  wstep: 'Faza 1 — Wstęp',
  przejscie_1: 'Przejście',
  sesja: 'Faza 2 — Sesja',
  przejscie_2: 'Przejście',
  podsumowanie: 'Faza 3 — Podsumowanie',
  outro: 'Outro',
  ended: 'Zakończona',
};

const PHASE_COLORS: Record<SimPhase, string> = {
  poczekalnia: 'bg-htg-lavender/20 text-htg-lavender',
  wstep: 'bg-htg-warm/20 text-htg-warm',
  przejscie_1: 'bg-htg-sage/20 text-htg-sage',
  sesja: 'bg-[#4ade80]/20 text-[#4ade80]',
  przejscie_2: 'bg-htg-sage/20 text-htg-sage',
  podsumowanie: 'bg-htg-warm/20 text-htg-warm',
  outro: 'bg-htg-lavender/20 text-htg-lavender',
  ended: 'bg-htg-fg-muted/20 text-htg-fg-muted',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CIRCLE_BASE = 132;
const ASST_SIZE = CIRCLE_BASE * 2; // 264px — 2× user circle, per design
const VIDEO_TOP = 60;
const VIDEO_PCT = 67;

// Speaking rotation: cycles through indices [0=natalia, 1=agata, 2=klient]
// Active phases get faster rotation
const SPEAKING_INTERVAL_MS = 3500;

// ─── Mock participants ────────────────────────────────────────────────────────

function buildParticipants(speakingIdx: number): {
  natalia: MockParticipant;
  agata: MockParticipant;
  klient: MockParticipant;
} {
  return {
    natalia: {
      name: 'Natalia HTG',
      identity: 'natalia',
      isLocal: false,
      isStaff: true,
      isMicrophoneEnabled: true,
      isSpeaking: speakingIdx === 0,
      role: 'practitioner',
    },
    agata: {
      name: 'Agata HTG',
      identity: 'agata',
      isLocal: false,
      isStaff: true,
      isMicrophoneEnabled: true,
      isSpeaking: speakingIdx === 1,
      role: 'assistant',
    },
    klient: {
      name: 'Klient Demo',
      identity: 'klient',
      isLocal: true,
      isStaff: false,
      isMicrophoneEnabled: true,
      isSpeaking: speakingIdx === 2,
      role: 'client',
    },
  };
}

// ─── Mock tile components ─────────────────────────────────────────────────────

function SimAudioMainTile({ p }: { p: MockParticipant }) {
  const glowColor = p.isSpeaking
    ? 'rgba(74,222,128,0.30)'
    : 'rgba(255,255,255,0.04)';

  return (
    <div
      className={`relative flex-1 h-full flex flex-col items-center justify-center gap-4 overflow-hidden
        transition-all duration-500
        ${p.isSpeaking ? 'ring-4 ring-[#4ade80]/40 ring-inset' : ''}`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 35%, rgba(15,20,40,0.95), #07091a 80%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% 40%, ${glowColor}, transparent 70%)`,
        }}
      />
      <div
        className={`relative z-10 flex items-center justify-center rounded-full
          transition-all duration-300
          ${
            p.isSpeaking
              ? 'ring-4 ring-[#4ade80]/70 shadow-[0_0_32px_8px_rgba(74,222,128,0.25)]'
              : 'ring-2 ring-white/15'
          }`}
        style={{
          width: 96,
          height: 96,
          background: p.isSpeaking
            ? 'rgba(74,222,128,0.15)'
            : 'rgba(255,255,255,0.06)',
        }}
      >
        <span className="text-4xl font-serif text-white/90 select-none">
          {p.name[0]}
        </span>
      </div>
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span className="text-white/90 font-medium text-sm tracking-wide">
          {p.name}
        </span>
        {!p.isMicrophoneEnabled && (
          <span className="flex items-center gap-1 text-red-400/80 text-xs">
            <MicOff className="w-3 h-3" /> wyciszony
          </span>
        )}
      </div>
      <div className="relative z-10">
        <Waveform
          speaking={p.isSpeaking}
          muted={!p.isMicrophoneEnabled}
          height={36}
        />
      </div>
    </div>
  );
}

function SimVideoMainTile({ p }: { p: MockParticipant }) {
  return (
    <div
      className={`relative flex-1 h-full overflow-hidden bg-black/40
        ${p.isSpeaking ? 'ring-4 ring-htg-sage ring-inset' : ''}`}
    >
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <div className="w-24 h-24 rounded-full bg-htg-lavender/30 flex items-center justify-center">
          <span className="text-4xl font-serif text-htg-cream">
            {p.name[0]}
          </span>
        </div>
        <span className="text-htg-cream/40 text-sm">Kamera wyłączona</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-sm text-white font-medium drop-shadow">
          {p.name}
        </span>
      </div>
    </div>
  );
}

function SimAudioCircleTile({ p, size }: { p: MockParticipant; size: number }) {
  const waveH = Math.round(size * 0.22);
  const avatarSize = Math.round(size * 0.48);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        flex flex-col items-center justify-center transition-all duration-300
        ${
          p.isSpeaking
            ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_24px_6px_rgba(74,222,128,0.20)]'
            : 'ring-2 ring-white/20'
        }`}
      style={{
        width: size,
        height: size,
        background: p.isSpeaking
          ? 'radial-gradient(circle, rgba(74,222,128,0.12) 0%, #09102a 70%)'
          : '#0b1124',
      }}
    >
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: avatarSize,
          height: avatarSize,
          background: p.isSpeaking
            ? 'rgba(74,222,128,0.18)'
            : 'rgba(255,255,255,0.07)',
        }}
      >
        <span
          className="font-serif text-white/90 select-none"
          style={{ fontSize: Math.round(avatarSize * 0.45) }}
        >
          {p.name[0]}
        </span>
      </div>
      <div className="mt-1">
        <Waveform
          speaking={p.isSpeaking}
          muted={!p.isMicrophoneEnabled}
          height={waveH}
        />
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/80 truncate px-1 font-medium">
          {p.name}
        </span>
      </div>
    </div>
  );
}

function SimVideoCircleTile({ p, size }: { p: MockParticipant; size: number }) {
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-xl
        ${p.isSpeaking ? 'ring-4 ring-htg-sage' : 'ring-2 ring-white/30'}`}
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full bg-htg-lavender/40 flex items-center justify-center">
        <span className="text-2xl font-serif text-htg-cream">{p.name[0]}</span>
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-0.5">
        <span className="text-[10px] text-white/90 truncate px-1 font-medium">
          {p.name}
        </span>
      </div>
    </div>
  );
}

// ─── Simulator video layout ───────────────────────────────────────────────────

function SimVideoLayout({
  viewMode,
  audioMode,
  participants,
}: {
  viewMode: ViewMode;
  audioMode?: boolean;
  participants: ReturnType<typeof buildParticipants>;
}) {
  const { natalia, agata, klient } = participants;

  // Client view: Natalia in main, Agata as overlay, Klient in bottom circle
  // Staff view: Klient in main, Natalia+Agata as overlay circles, Natalia in bottom circle (self-view)
  const mainParticipants =
    viewMode === 'user' ? [natalia] : [klient];
  const assistants =
    viewMode === 'user' ? [agata] : [natalia, agata];
  const circleParticipants =
    viewMode === 'user' ? [klient] : [natalia];

  const circleSize = CIRCLE_BASE;
  const overlapPx = Math.round(circleSize / 3);
  const videoBottom = `${VIDEO_PCT}%`;
  const circleTop = `calc(${VIDEO_PCT}% - ${overlapPx}px)`;
  const gradientTop = `calc(${VIDEO_PCT}% - 48px)`;

  const MainTile = audioMode ? SimAudioMainTile : SimVideoMainTile;
  const CircleTile = audioMode ? SimAudioCircleTile : SimVideoCircleTile;

  return (
    <div className="relative w-full h-full overflow-visible">
      {/* Main video / audio area */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: VIDEO_TOP, bottom: `calc(100% - ${videoBottom})` }}
      >
        <div className="relative h-full" style={{ width: '70%' }}>
          {/* Main tiles */}
          <div className="absolute inset-0 flex gap-px overflow-hidden rounded-2xl">
            {mainParticipants.map((p) => (
              <MainTile key={p.identity} p={p} />
            ))}
          </div>

          {/* Assistant overlay circles — right side, 50% hanging outside */}
          {assistants.length > 0 && (
            <div
              className="absolute right-0 z-10 flex flex-col"
              style={{ top: 50, gap: 32 }}
            >
              {assistants.map((p) => (
                <div key={p.identity} style={{ transform: 'translateX(50%)' }}>
                  {audioMode
                    ? <SimAudioCircleTile p={p} size={ASST_SIZE} />
                    : <SimVideoCircleTile p={p} size={ASST_SIZE} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Gradient */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{
          top: gradientTop,
          height: 48,
          background:
            'linear-gradient(to bottom, transparent, rgba(6,8,28,0.5))',
        }}
      />

      {/* Bottom circle row + controls */}
      <div
        className="absolute inset-x-0 flex items-start justify-between px-6"
        style={{ top: circleTop }}
      >
        <div style={{ minWidth: 48 }} />

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-start justify-center gap-4">
            {circleParticipants.map((p) => (
              <CircleTile key={p.identity} p={p} size={circleSize} />
            ))}
          </div>

          {/* Mock media controls */}
          <div className="flex items-center gap-2 mt-1">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80 text-xs transition-colors">
              <Mic className="w-4 h-4" />
              Mikrofon
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80 text-xs transition-colors">
              <Video className="w-4 h-4" />
              Kamera
            </button>
          </div>
        </div>

        <div style={{ minWidth: 48 }} />
      </div>
    </div>
  );
}

// ─── Mock waiting room ────────────────────────────────────────────────────────

function MockWaitingRoom({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div className="relative flex flex-col items-center w-full h-screen bg-[#0a0e1a] overflow-hidden">
      <SessionAnimation variant={0} opacity={0.6} active />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6 pt-16 pb-8 max-w-lg w-full">
        {/* HTG Logo placeholder */}
        <div className="w-20 h-20 rounded-full bg-htg-warm/15 border border-htg-warm/30 flex items-center justify-center mt-8">
          <span className="text-htg-warm font-serif text-2xl font-bold">H</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-serif text-htg-cream">
            {viewMode === 'user'
              ? 'Witaj w poczekalni'
              : 'Panel prowadzącego'}
          </h1>
          <p className="text-htg-cream/60 text-sm">
            {viewMode === 'user'
              ? 'Prowadzący dołączy do sesji za chwilę. Przygotuj się...'
              : 'Klient oczekuje w poczekalni. Kliknij „Dołącz" aby rozpocząć.'}
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-htg-warm/10 border border-htg-warm/20">
          <div className="w-2 h-2 rounded-full bg-htg-warm animate-pulse" />
          <span className="text-htg-warm/80 text-xs font-medium">
            {viewMode === 'user'
              ? 'Oczekiwanie na prowadzącego...'
              : '1 klient oczekuje'}
          </span>
        </div>

        {/* Device check mock */}
        {viewMode === 'user' && (
          <div className="w-full max-w-sm bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
            <p className="text-htg-cream/60 text-xs font-medium uppercase tracking-wide">
              Sprawdzanie urządzenia
            </p>
            {[
              { label: 'Mikrofon', ok: true },
              { label: 'Kamera', ok: true },
              { label: 'Połączenie', ok: true },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-htg-cream/70 text-sm">{label}</span>
                <CheckCircle2
                  className={`w-4 h-4 ${ok ? 'text-[#4ade80]' : 'text-htg-fg-muted'}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mock outro screen ────────────────────────────────────────────────────────

function MockOutroScreen({ onNext }: { onNext: () => void }) {
  const [remaining, setRemaining] = useState(120);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(interval); onNext(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onNext]);

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div className="relative flex flex-col items-center w-full h-screen bg-htg-indigo overflow-auto">
      <SessionAnimation variant={3} opacity={0.5} active />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6 pt-16 pb-8 max-w-lg w-full">
        <div className="w-16 h-16 rounded-full bg-htg-warm/20 flex items-center justify-center mt-8">
          <div className="w-8 h-8 rounded-full bg-htg-warm animate-pulse" />
        </div>

        <h1 className="text-2xl font-serif text-htg-cream">
          Sesja zakończona
        </h1>
        <p className="text-htg-cream/60 text-sm">
          Dziękujemy za udział. Możesz teraz nagrać swoje odczucia po sesji.
        </p>

        <div className="flex items-center gap-2 text-htg-cream/40 text-sm">
          <Clock className="w-4 h-4" />
          Okno zamknie się za {min}:{sec.toString().padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}

// ─── Break overlay ────────────────────────────────────────────────────────────

function BreakOverlay() {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-htg-warm/20 flex items-center justify-center">
          <CoffeeIcon className="w-8 h-8 text-htg-warm" />
        </div>
        <h2 className="text-2xl font-serif text-htg-cream">Przerwa</h2>
        <p className="text-htg-cream/60 text-sm">
          Sesja jest wstrzymana...
        </p>
      </div>
    </div>
  );
}

// ─── Staff controls overlay ───────────────────────────────────────────────────

function StaffControls({
  phase,
  breakActive,
  onJoin,
  onNext,
  onBreakToggle,
  onEnd,
}: {
  phase: SimPhase;
  breakActive: boolean;
  onJoin: () => void;
  onNext: () => void;
  onBreakToggle: () => void;
  onEnd: () => void;
}) {
  const isEnded = phase === 'ended';
  const isWaiting = phase === 'poczekalnia';
  const canBreak =
    phase === 'sesja' || phase === 'podsumowanie' || phase === 'wstep';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 shadow-2xl">
      {/* Join button (only in waiting room) */}
      {isWaiting && (
        <button
          onClick={onJoin}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-htg-sage hover:bg-htg-sage/80 text-white text-sm font-medium transition-colors"
        >
          <Play className="w-4 h-4" />
          Dołącz
        </button>
      )}

      {/* Next phase */}
      {!isWaiting && !isEnded && (
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-htg-warm/20 hover:bg-htg-warm/30 text-htg-warm text-sm font-medium transition-colors border border-htg-warm/30"
        >
          <SkipForward className="w-4 h-4" />
          Kolejna faza
        </button>
      )}

      {/* Break toggle */}
      {canBreak && (
        <button
          onClick={onBreakToggle}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            breakActive
              ? 'bg-htg-warm text-white hover:bg-htg-warm/90'
              : 'bg-white/10 hover:bg-white/15 text-white/70 border border-white/10'
          }`}
        >
          <Coffee className="w-4 h-4" />
          {breakActive ? 'Wznów' : 'Przerwa'}
        </button>
      )}

      {/* End session */}
      {!isEnded && !isWaiting && (
        <button
          onClick={onEnd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors border border-red-500/20"
        >
          <Square className="w-4 h-4" />
          Zakończ
        </button>
      )}

      {isEnded && (
        <span className="text-htg-fg-muted/60 text-sm px-2">
          Sesja zakończona
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveSimulatorClient() {
  const [phase, setPhase] = useState<SimPhase>('poczekalnia');
  const [viewMode, setViewMode] = useState<ViewMode>('user');
  const [breakActive, setBreakActive] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Speaking rotation — only during active phases
  useEffect(() => {
    const activePhasesForSpeaking: SimPhase[] = ['wstep', 'sesja', 'podsumowanie'];
    if (!activePhasesForSpeaking.includes(phase) || breakActive) return;

    const interval = setInterval(() => {
      setSpeakingIdx((i) => (i + 1) % 3);
    }, SPEAKING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, breakActive]);

  // Elapsed timer — starts when session begins
  useEffect(() => {
    if (!sessionStarted) return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionStarted]);

  const participants = buildParticipants(speakingIdx);

  const advancePhase = useCallback(() => {
    setPhase((current) => {
      const idx = PHASE_ORDER.indexOf(current);
      return idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : current;
    });
  }, []);

  const handleJoin = useCallback(() => {
    setSessionStarted(true);
    advancePhase();
  }, [advancePhase]);

  const handleBreakToggle = useCallback(() => {
    setBreakActive((b) => !b);
  }, []);

  const handleEnd = useCallback(() => {
    setPhase('outro');
    setBreakActive(false);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Render phase screen ───────────────────────────────────────────────────

  function renderPhaseScreen() {
    switch (phase) {
      case 'poczekalnia':
        return <MockWaitingRoom viewMode={viewMode} />;

      case 'wstep':
        return (
          <div
            className="relative w-full h-screen"
            style={{ background: '#06081c' }}
          >
            <SessionAnimation variant={1} opacity={0.7} active />
            <SimVideoLayout
              viewMode={viewMode}
              audioMode={false}
              participants={participants}
            />
          </div>
        );

      case 'przejscie_1':
        return (
          <PhaseTransition
            variant={1}
            onComplete={advancePhase}
          />
        );

      case 'sesja':
        return (
          <div
            className="relative w-full h-screen"
            style={{ background: '#06081c' }}
          >
            <SessionAnimation variant={1} opacity={0.3} active />
            <SimVideoLayout
              viewMode={viewMode}
              audioMode={true}
              participants={participants}
            />
          </div>
        );

      case 'przejscie_2':
        return (
          <PhaseTransition
            variant={2}
            onComplete={advancePhase}
          />
        );

      case 'podsumowanie':
        return (
          <div
            className="relative w-full h-screen"
            style={{ background: '#06081c' }}
          >
            <SessionAnimation variant={2} opacity={0.5} active />
            <SimVideoLayout
              viewMode={viewMode}
              audioMode={false}
              participants={participants}
            />
          </div>
        );

      case 'outro':
        return <MockOutroScreen onNext={() => setPhase('ended')} />;

      case 'ended':
        return (
          <div className="relative flex flex-col items-center justify-center w-full h-screen bg-htg-indigo">
            <SessionAnimation variant={3} opacity={0.4} active />
            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#4ade80]" />
              <h1 className="text-3xl font-serif text-htg-cream">
                Sesja zakończona
              </h1>
              <p className="text-htg-cream/50 text-sm">
                Czas trwania: {formatTime(elapsed)}
              </p>
              <button
                onClick={() => {
                  setPhase('poczekalnia');
                  setElapsed(0);
                  setSessionStarted(false);
                  setBreakActive(false);
                  setSpeakingIdx(0);
                }}
                className="mt-4 px-6 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
              >
                Restart symulatora
              </button>
            </div>
          </div>
        );
    }
  }

  // ─── Phase timeline (top) ──────────────────────────────────────────────────

  const currentPhaseIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#06081c]">
      {/* Top bar */}
      <div className="relative z-50 flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
          <button
            onClick={() => setViewMode('user')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'user'
                ? 'bg-htg-sage text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Widok klienta
          </button>
          <button
            onClick={() => setViewMode('staff')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'staff'
                ? 'bg-htg-warm text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Widok prowadzącego
          </button>
        </div>

        {/* Phase timeline */}
        <div className="flex items-center gap-1">
          {PHASE_ORDER.filter(
            (p) => !['przejscie_1', 'przejscie_2'].includes(p),
          ).map((p, displayIdx) => {
            const realIdx = PHASE_ORDER.indexOf(p);
            const active = phase === p;
            const done = currentPhaseIdx > realIdx;
            return (
              <div key={p} className="flex items-center gap-1">
                <div
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    active
                      ? PHASE_COLORS[p]
                      : done
                        ? 'bg-white/5 text-white/30'
                        : 'bg-white/5 text-white/20'
                  }`}
                >
                  {PHASE_LABELS[p]}
                </div>
                {displayIdx <
                  PHASE_ORDER.filter(
                    (p) => !['przejscie_1', 'przejscie_2'].includes(p),
                  ).length -
                    1 && (
                  <ChevronRight className="w-3 h-3 text-white/20" />
                )}
              </div>
            );
          })}
        </div>

        {/* Timer */}
        <div className="flex items-center gap-1.5 text-white/50 text-xs">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(elapsed)}
          <span className="ml-2 text-white/20">SYMULATOR</span>
        </div>
      </div>

      {/* Phase screen */}
      <div className="relative flex-1 overflow-hidden">
        {renderPhaseScreen()}

        {/* Break overlay */}
        {breakActive && <BreakOverlay />}
      </div>

      {/* Staff controls */}
      <StaffControls
        phase={phase}
        breakActive={breakActive}
        onJoin={handleJoin}
        onNext={advancePhase}
        onBreakToggle={handleBreakToggle}
        onEnd={handleEnd}
      />
    </div>
  );
}
