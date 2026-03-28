'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, ChevronRight, Users, User, Mic, MicOff,
  Video, VideoOff, Clock, CheckCircle, Bell, Volume2, VolumeX,
  Zap, AlertCircle, Coffee, LogIn, LogOut, MonitorPlay,
} from 'lucide-react';

// ─── Phase definitions ──────────────────────────────────────────────────────

type SimPhaseId =
  | 'poczekalnia' | 'wstep' | 'przejscie_1' | 'sesja'
  | 'przejscie_2' | 'podsumowanie' | 'outro' | 'wyciszenie' | 'ended';

interface SimPhase {
  id: SimPhaseId;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  userDuration: number; // seconds (0 = instant/no countdown)
  isTransition: boolean;
  /** What the USER sees on screen */
  userView: { title: string; desc: string; audio: boolean; video: boolean };
  /** What STAFF sees */
  staffView: { title: string; desc: string; audio: boolean; video: boolean };
  /** Button label to advance to next phase (staff mode) */
  staffAdvanceLabel?: string;
  /** Whether break button is available in this phase (staff) */
  hasBreak?: boolean;
}

const PHASES: SimPhase[] = [
  {
    id: 'poczekalnia',
    label: 'Poczekalnia',
    sublabel: 'Oczekiwanie',
    icon: '🚪',
    color: 'text-slate-400',
    bgColor: 'bg-slate-800',
    borderColor: 'border-slate-600',
    userDuration: 15,
    isTransition: false,
    userView: {
      title: 'Oczekiwanie na prowadzącą…',
      desc: 'Muzyka tła, animacja oczekiwania. Kamera i mikrofon wyłączone.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Klient czeka w poczekalni',
      desc: 'Widoczna lista uczestników. Można wpuścić klienta gdy gotowi.',
      audio: false,
      video: false,
    },
    staffAdvanceLabel: 'Wpuść klienta → Wstęp',
  },
  {
    id: 'wstep',
    label: 'Faza 1',
    sublabel: 'Wstęp',
    icon: '📹',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/40',
    borderColor: 'border-blue-600',
    userDuration: 15,
    isTransition: false,
    userView: {
      title: 'Wstęp — rozmowa wstępna',
      desc: 'Kamera i mikrofon włączone. Widok wideo wszystkich uczestników.',
      audio: true,
      video: true,
    },
    staffView: {
      title: 'Faza 1 — Wstęp',
      desc: 'Rozmowa wstępna z klientem. Nagrywanie aktywne. Dostępne: pauza/przerwa.',
      audio: true,
      video: true,
    },
    staffAdvanceLabel: 'Zakończ wstęp → Przejście',
    hasBreak: true,
  },
  {
    id: 'przejscie_1',
    label: 'Przejście',
    sublabel: 'do sesji',
    icon: '🎵',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30',
    borderColor: 'border-purple-600',
    userDuration: 10,
    isTransition: true,
    userView: {
      title: 'Przejście — animacja muzyczna',
      desc: 'Muzyka przejściowa, animacja wizualna. Kamera i mikrofon wyłączone.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Przejście — czas na przygotowanie',
      desc: 'Klient widzi animację. Możesz ręcznie przejść do sesji gdy gotowy.',
      audio: false,
      video: false,
    },
    staffAdvanceLabel: 'Rozpocznij Sesję →',
  },
  {
    id: 'sesja',
    label: 'Faza 2',
    sublabel: 'Sesja',
    icon: '🎙️',
    color: 'text-green-400',
    bgColor: 'bg-green-900/40',
    borderColor: 'border-green-600',
    userDuration: 15,
    isTransition: false,
    userView: {
      title: 'Sesja — tylko dźwięk',
      desc: 'Mikrofon włączony, kamera wyłączona. Animacja wizualna w tle. Nagrywanie.',
      audio: true,
      video: false,
    },
    staffView: {
      title: 'Faza 2 — Sesja główna',
      desc: 'Sesja audio. Nagrywanie per uczestnik aktywne. Dostępne: przerwa, zakończ.',
      audio: true,
      video: false,
    },
    staffAdvanceLabel: 'Zakończ Sesję → Przejście',
    hasBreak: true,
  },
  {
    id: 'przejscie_2',
    label: 'Przejście',
    sublabel: 'do podsumowania',
    icon: '🎵',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-600',
    userDuration: 10,
    isTransition: true,
    userView: {
      title: 'Przejście — animacja muzyczna',
      desc: 'Muzyka przejściowa, 15s auto-fade. Automatyczne przejście do podsumowania.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Przejście — czas na chwilę oddechu',
      desc: 'Auto-przejście do podsumowania po wyciszeniu muzyki.',
      audio: false,
      video: false,
    },
  },
  {
    id: 'podsumowanie',
    label: 'Faza 3',
    sublabel: 'Podsumowanie',
    icon: '✨',
    color: 'text-teal-400',
    bgColor: 'bg-teal-900/40',
    borderColor: 'border-teal-600',
    userDuration: 15,
    isTransition: false,
    userView: {
      title: 'Podsumowanie — wideo z prowadzącą',
      desc: 'Kamera i mikrofon włączone. Rozmowa podsumowująca. Nagrywanie.',
      audio: true,
      video: true,
    },
    staffView: {
      title: 'Faza 3 — Podsumowanie',
      desc: 'Rozmowa podsumowująca z klientem. Nagrywanie aktywne.',
      audio: true,
      video: true,
    },
    staffAdvanceLabel: 'Zakończ podsumowanie → Outro',
    hasBreak: true,
  },
  {
    id: 'outro',
    label: 'Outro',
    sublabel: 'zamknięcie',
    icon: '🎬',
    color: 'text-rose-400',
    bgColor: 'bg-rose-900/30',
    borderColor: 'border-rose-600',
    userDuration: 10,
    isTransition: true,
    userView: {
      title: 'Outro — animacja zamykająca',
      desc: 'Animacja outro z muzyką. Sesja dobiega końca.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Outro — sesja się kończy',
      desc: 'Animacja zamykająca. Można zakończyć sesję lub poczekać na auto-koniec.',
      audio: false,
      video: false,
    },
    staffAdvanceLabel: 'Zakończ sesję',
  },
  {
    id: 'wyciszenie',
    label: 'Wyciszenie',
    sublabel: 'fade out',
    icon: '🔇',
    color: 'text-slate-500',
    bgColor: 'bg-slate-800/60',
    borderColor: 'border-slate-700',
    userDuration: 15,
    isTransition: true,
    userView: {
      title: 'Wyciszenie końcowe',
      desc: 'Muzyka opada płynnie przez 15 sekund. Cisza przed zakończeniem.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Wyciszenie — ostatnie 15 sekund',
      desc: 'Muzyka stopniowo wycisza się. Sesja zaraz zostanie zamknięta.',
      audio: false,
      video: false,
    },
  },
  {
    id: 'ended',
    label: 'Koniec',
    sublabel: 'zakończona',
    icon: '✅',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/20',
    borderColor: 'border-emerald-700',
    userDuration: 0,
    isTransition: false,
    userView: {
      title: 'Sesja zakończona',
      desc: 'Dziękujemy za sesję. Nagranie będzie dostępne w Twoim profilu.',
      audio: false,
      video: false,
    },
    staffView: {
      title: 'Sesja zakończona',
      desc: 'Sesja zakończona. Statystyki czasu zapisane. Rozliczenie inicjowane.',
      audio: false,
      video: false,
    },
  },
];

const PHASE_IDS = PHASES.map(p => p.id);

// ─── Log entry ───────────────────────────────────────────────────────────────

interface LogEntry {
  phaseId: SimPhaseId;
  label: string;
  startedAt: Date;
  endedAt?: Date;
  triggeredBy: 'auto' | 'manual' | 'break_end';
}

// ─── Main component ──────────────────────────────────────────────────────────

type SimMode = 'user' | 'staff';

export default function SessionSimulator() {
  const [mode, setMode] = useState<SimMode>('user');
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [breakActive, setBreakActive] = useState(false);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const totalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPhase = PHASES[phaseIdx];
  const isEnded = currentPhase.id === 'ended';

  // ── Total elapsed timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (running && !isEnded) {
      totalRef.current = setInterval(() => setTotalSeconds(s => s + 1), 1000);
    } else {
      if (totalRef.current) clearInterval(totalRef.current);
    }
    return () => { if (totalRef.current) clearInterval(totalRef.current); };
  }, [running, isEnded]);

  // ── Countdown / auto-advance (user mode only) ────────────────────────────
  const advancePhase = useCallback((triggeredBy: 'auto' | 'manual' | 'break_end' = 'auto') => {
    setPhaseIdx(prev => {
      const next = Math.min(prev + 1, PHASES.length - 1);
      const now = new Date();

      setLog(log => {
        const updated = [...log];
        if (updated.length > 0) updated[updated.length - 1].endedAt = now;
        const nextPhase = PHASES[next];
        if (nextPhase.id !== 'ended') {
          updated.push({ phaseId: nextPhase.id, label: nextPhase.label + ' ' + nextPhase.sublabel, startedAt: now, triggeredBy });
        } else {
          updated.push({ phaseId: 'ended', label: 'Koniec sesji', startedAt: now, triggeredBy, endedAt: now });
        }
        return updated;
      });

      return next;
    });
  }, []);

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (!running || mode !== 'user' || isEnded || breakActive) {
      setCountdown(0);
      return;
    }

    if (currentPhase.userDuration === 0) {
      return;
    }

    setCountdown(currentPhase.userDuration);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          advancePhase('auto');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [phaseIdx, running, mode, breakActive, isEnded, advancePhase, currentPhase.userDuration]);

  // ── Break timer (staff mode) ──────────────────────────────────────────────
  useEffect(() => {
    if (!breakActive) { setBreakSeconds(0); return; }
    const id = setInterval(() => setBreakSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [breakActive]);

  function startSimulation() {
    if (running) return;
    const now = new Date();
    setRunning(true);
    setTotalSeconds(0);
    setLog([{ phaseId: 'poczekalnia', label: 'Poczekalnia', startedAt: now, triggeredBy: 'manual' }]);
  }

  function resetSimulation() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (totalRef.current) clearInterval(totalRef.current);
    setPhaseIdx(0);
    setRunning(false);
    setCountdown(0);
    setLog([]);
    setBreakActive(false);
    setBreakSeconds(0);
    setTotalSeconds(0);
  }

  function toggleBreak() {
    if (!breakActive) {
      setBreakActive(true);
    } else {
      setBreakActive(false);
      advancePhase('break_end');
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function formatHMS(d: Date) {
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  const progressPct = isEnded ? 100 : (phaseIdx / (PHASES.length - 1)) * 100;
  const view = mode === 'user' ? currentPhase.userView : currentPhase.staffView;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-htg-sage" />
            Symulator Sesji
          </h2>
          <p className="text-sm text-htg-fg-muted mt-0.5">Symulacja przebiegu sesji indywidualnej — bez LiveKit</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Total timer */}
          {running && (
            <div className="flex items-center gap-1.5 text-sm font-mono bg-htg-surface border border-htg-card-border rounded-lg px-3 py-1.5">
              <Clock className="w-4 h-4 text-htg-sage" />
              <span className="text-htg-fg font-bold">{formatTime(totalSeconds)}</span>
            </div>
          )}

          <button
            onClick={resetSimulation}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-fg/30 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 p-1 bg-htg-surface rounded-xl border border-htg-card-border w-fit">
        <button
          onClick={() => { setMode('user'); resetSimulation(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'user'
              ? 'bg-htg-sage text-white shadow-sm'
              : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <User className="w-4 h-4" />
          Widok Użytkownika
          <span className={`text-xs px-1.5 py-0.5 rounded ${mode === 'user' ? 'bg-white/20' : 'bg-htg-card text-htg-fg-muted'}`}>auto</span>
        </button>
        <button
          onClick={() => { setMode('staff'); resetSimulation(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'staff'
              ? 'bg-htg-indigo text-white shadow-sm'
              : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <Users className="w-4 h-4" />
          Widok Prowadzącego
          <span className={`text-xs px-1.5 py-0.5 rounded ${mode === 'staff' ? 'bg-white/20' : 'bg-htg-card text-htg-fg-muted'}`}>ręczny</span>
        </button>
      </div>

      {/* Phase progress bar */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-htg-fg-muted">Postęp sesji</span>
          <span className="text-xs text-htg-fg-muted">{Math.round(progressPct)}%</span>
        </div>
        {/* Timeline dots */}
        <div className="relative flex items-center justify-between mb-2">
          <div className="absolute left-0 right-0 h-0.5 bg-htg-card-border top-1/2 -translate-y-1/2" />
          <div
            className="absolute left-0 h-0.5 bg-htg-sage top-1/2 -translate-y-1/2 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
          {PHASES.map((p, i) => (
            <div key={p.id} className="relative z-10 flex flex-col items-center" title={p.label + ' ' + p.sublabel}>
              <div className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                i < phaseIdx ? 'bg-htg-sage border-htg-sage' :
                i === phaseIdx && running ? `border-2 ${p.borderColor} bg-htg-bg ring-2 ring-offset-1 ring-htg-sage/50` :
                'bg-htg-bg border-htg-card-border'
              }`} />
            </div>
          ))}
        </div>
        {/* Phase labels */}
        <div className="flex items-start justify-between">
          {PHASES.map((p, i) => (
            <div key={p.id} className={`flex flex-col items-center text-center w-12 ${i === phaseIdx && running ? 'opacity-100' : 'opacity-40'}`}>
              <span className="text-[10px] leading-tight text-htg-fg-muted">{p.icon}</span>
              <span className={`text-[9px] leading-tight font-medium mt-0.5 ${i === phaseIdx && running ? p.color : 'text-htg-fg-muted'}`}>
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main view / Screen preview */}
        <div className="lg:col-span-2 space-y-4">

          {/* Screen preview */}
          <div className={`rounded-xl border-2 p-6 transition-all duration-500 min-h-48 ${
            running ? `${currentPhase.bgColor} ${currentPhase.borderColor}` : 'bg-htg-surface border-htg-card-border'
          }`}>
            {!running ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <MonitorPlay className="w-12 h-12 text-htg-fg-muted/30 mb-3" />
                <p className="text-htg-fg-muted text-sm">Naciśnij „Start" aby rozpocząć symulację</p>
                <p className="text-htg-fg-muted/60 text-xs mt-1">
                  {mode === 'user' ? 'Tryb automatyczny — fazy przechodzą same' : 'Tryb ręczny — kontrolujesz każdą fazę'}
                </p>
              </div>
            ) : (
              <div>
                {/* Phase badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border ${currentPhase.borderColor} ${currentPhase.color} bg-htg-bg/40`}>
                    <span>{currentPhase.icon}</span>
                    <span>{currentPhase.label.toUpperCase()}</span>
                    {currentPhase.isTransition && <span className="opacity-60">— {currentPhase.sublabel}</span>}
                    {!currentPhase.isTransition && <span className="opacity-60">— {currentPhase.sublabel}</span>}
                  </div>

                  {/* Media indicators */}
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${view.video ? 'bg-blue-900/40 text-blue-300' : 'bg-htg-bg/40 text-htg-fg-muted/40'}`}>
                      {view.video ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                      <span>Kamera</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${view.audio ? 'bg-green-900/40 text-green-300' : 'bg-htg-bg/40 text-htg-fg-muted/40'}`}>
                      {view.audio ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                      <span>Mikrofon</span>
                    </div>
                  </div>
                </div>

                {/* View content */}
                <div className="mb-4">
                  <h3 className="text-lg font-serif font-semibold text-htg-fg mb-1">{view.title}</h3>
                  <p className="text-sm text-htg-fg-muted leading-relaxed">{view.desc}</p>
                </div>

                {/* Break indicator */}
                {breakActive && (
                  <div className="flex items-center gap-2 mt-3 p-3 bg-htg-warm/10 border border-htg-warm/40 rounded-lg">
                    <Coffee className="w-4 h-4 text-htg-warm animate-pulse" />
                    <span className="text-sm text-htg-warm font-medium">Przerwa aktywna</span>
                    <span className="ml-auto text-xs font-mono text-htg-warm">{formatTime(breakSeconds)}</span>
                  </div>
                )}

                {/* User mode countdown */}
                {mode === 'user' && !isEnded && countdown > 0 && !breakActive && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-htg-fg-muted mb-1.5">
                      <span>Auto-przejście do następnej fazy</span>
                      <span className={`font-mono font-bold text-sm ${countdown <= 3 ? 'text-htg-warm animate-pulse' : currentPhase.color}`}>
                        {countdown}s
                      </span>
                    </div>
                    <div className="h-1.5 bg-htg-bg/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          countdown <= 3 ? 'bg-htg-warm' : 'bg-htg-sage'
                        }`}
                        style={{ width: `${(countdown / currentPhase.userDuration) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Ended state */}
                {isEnded && (
                  <div className="flex items-center gap-3 mt-2 p-3 bg-emerald-900/20 border border-emerald-700 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Symulacja zakończona</p>
                      <p className="text-xs text-htg-fg-muted">Całkowity czas: {formatTime(totalSeconds)}</p>
                    </div>
                    <button
                      onClick={resetSimulation}
                      className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700 rounded-lg hover:bg-emerald-900/50 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restart
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
            {!running ? (
              <button
                onClick={startSimulation}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-all ${
                  mode === 'user'
                    ? 'bg-htg-sage text-white hover:bg-htg-sage/90'
                    : 'bg-htg-indigo text-white hover:bg-htg-indigo/90'
                }`}
              >
                <Play className="w-5 h-5" />
                Rozpocznij symulację — {mode === 'user' ? 'Widok Użytkownika' : 'Widok Prowadzącego'}
              </button>
            ) : mode === 'user' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-htg-fg-muted mb-2">
                  <Zap className="w-3.5 h-3.5 text-htg-sage" />
                  <span>Tryb automatyczny — fazy przechodzą automatycznie co {currentPhase.userDuration}s</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => advancePhase('manual')}
                    disabled={isEnded}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-htg-surface border border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-fg/30 transition-colors disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Pomiń — następna faza
                  </button>
                </div>
              </div>
            ) : (
              /* Staff controls */
              <div className="space-y-2">
                <p className="text-xs text-htg-fg-muted mb-3 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Tryb ręczny — Ty decydujesz o przejściach
                </p>

                <div className="flex gap-2 flex-wrap">
                  {/* Main advance button */}
                  {currentPhase.staffAdvanceLabel && !breakActive && !isEnded && (
                    <button
                      onClick={() => advancePhase('manual')}
                      className="flex items-center gap-2 px-4 py-2.5 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage/90 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                      {currentPhase.staffAdvanceLabel}
                    </button>
                  )}

                  {/* Auto-advance notice for transitions without staff button */}
                  {!currentPhase.staffAdvanceLabel && !isEnded && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg-muted">
                      <AlertCircle className="w-4 h-4" />
                      Auto-przejście po muzyce
                      <button
                        onClick={() => advancePhase('manual')}
                        className="ml-2 text-xs text-htg-sage hover:underline"
                      >
                        (pomiń)
                      </button>
                    </div>
                  )}

                  {/* Break button */}
                  {currentPhase.hasBreak && !isEnded && (
                    <button
                      onClick={toggleBreak}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        breakActive
                          ? 'bg-htg-warm text-white hover:bg-htg-warm/90'
                          : 'bg-htg-surface border border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-warm/50'
                      }`}
                    >
                      <Coffee className="w-4 h-4" />
                      {breakActive ? `Zakończ przerwę (${formatTime(breakSeconds)})` : 'Symuluj przerwę'}
                    </button>
                  )}
                </div>

                {/* Phase description for staff */}
                <div className="mt-3 pt-3 border-t border-htg-card-border">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-htg-fg-muted">
                      <LogIn className="w-3 h-3" />
                      <span>Dołącz: <span className="text-htg-fg">{phaseIdx === 0 && !running ? '—' : '✓'}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-htg-fg-muted">
                      <Bell className="w-3 h-3" />
                      <span>Przerwy: <span className="text-htg-fg">{breakActive ? 'aktywna' : 'brak'}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-htg-fg-muted">
                      <LogOut className="w-3 h-3" />
                      <span>Koniec: <span className="text-htg-fg">{isEnded ? '✓' : '—'}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: phase list + log */}
        <div className="space-y-4">
          {/* Phase checklist */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-htg-sage" />
              Fazy sesji
            </h3>
            <div className="space-y-1">
              {PHASES.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                    i === phaseIdx && running
                      ? `${p.bgColor} ${p.borderColor} border`
                      : i < phaseIdx
                        ? 'bg-htg-surface text-htg-fg-muted'
                        : 'text-htg-fg-muted/50'
                  }`}
                >
                  <span className="text-sm">{p.icon}</span>
                  <div className="flex-1">
                    <span className={`font-medium ${i === phaseIdx && running ? p.color : ''}`}>
                      {p.label}
                    </span>
                    <span className="text-htg-fg-muted ml-1">{p.sublabel}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.userDuration > 0 && mode === 'user' && (
                      <span className="text-htg-fg-muted/60">
                        {i === phaseIdx && running && countdown > 0 ? (
                          <span className={`font-mono font-bold ${p.color}`}>{countdown}s</span>
                        ) : (
                          <span>{p.userDuration}s</span>
                        )}
                      </span>
                    )}
                    {i < phaseIdx && <CheckCircle className="w-3.5 h-3.5 text-htg-sage" />}
                    {i === phaseIdx && running && (
                      <div className="w-2 h-2 rounded-full bg-htg-sage animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Timing summary for user mode */}
            {mode === 'user' && (
              <div className="mt-3 pt-3 border-t border-htg-card-border text-xs text-htg-fg-muted">
                <div className="flex justify-between">
                  <span>Szacowany czas całkowity:</span>
                  <span className="font-medium text-htg-fg">
                    {formatTime(PHASES.reduce((acc, p) => acc + p.userDuration, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Activity log */}
          {log.length > 0 && (
            <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-htg-sage" />
                Dziennik
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {log.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-htg-fg-muted shrink-0 mt-0.5">{formatHMS(entry.startedAt)}</span>
                    <div className="flex-1">
                      <span className="text-htg-fg font-medium">{entry.label}</span>
                      <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] ${
                        entry.triggeredBy === 'auto' ? 'bg-htg-sage/20 text-htg-sage' :
                        entry.triggeredBy === 'break_end' ? 'bg-htg-warm/20 text-htg-warm' :
                        'bg-htg-indigo/20 text-htg-indigo-light'
                      }`}>
                        {entry.triggeredBy === 'auto' ? 'auto' : entry.triggeredBy === 'break_end' ? 'po przerwie' : 'ręcznie'}
                      </span>
                      {entry.endedAt && (
                        <span className="ml-1.5 text-htg-fg-muted">
                          {Math.round((entry.endedAt.getTime() - entry.startedAt.getTime()) / 1000)}s
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
