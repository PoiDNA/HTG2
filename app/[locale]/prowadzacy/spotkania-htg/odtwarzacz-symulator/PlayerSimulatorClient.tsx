'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Users2, Clock } from 'lucide-react';

// ── Mock data ─────────────────────────────────────────────────────────────────
const DURATION = 48 * 60; // 48 minutes mock session

interface Segment { start: number; end: number; }
interface Track { userId: string; name: string; color: string; segments: Segment[]; }

const MOCK_TRACKS: Track[] = [
  {
    userId: 'mod', name: 'Anna K. (mod)', color: '#f59e0b',
    segments: [
      { start: 0, end: 65 },
      { start: 240, end: 290 },
      { start: 580, end: 620 },
      { start: 900, end: 940 },
      { start: 1440, end: 1500 },
      { start: 1740, end: 1780 },
      { start: 2100, end: 2160 },
      { start: 2520, end: 2560 },
      { start: 2700, end: 2760 },
    ],
  },
  {
    userId: 'p1', name: 'Marta W.', color: '#4ade80',
    segments: [
      { start: 70, end: 145 },
      { start: 420, end: 490 },
      { start: 820, end: 880 },
      { start: 1200, end: 1260 },
      { start: 1620, end: 1690 },
      { start: 2200, end: 2270 },
      { start: 2600, end: 2650 },
    ],
  },
  {
    userId: 'p2', name: 'Piotr M.', color: '#60a5fa',
    segments: [
      { start: 150, end: 230 },
      { start: 500, end: 570 },
      { start: 960, end: 1020 },
      { start: 1380, end: 1430 },
      { start: 1800, end: 1860 },
      { start: 2310, end: 2380 },
      { start: 2680, end: 2740 },
    ],
  },
  {
    userId: 'p3', name: 'Joanna B.', color: '#f472b6',
    segments: [
      { start: 295, end: 360 },
      { start: 625, end: 700 },
      { start: 1050, end: 1110 },
      { start: 1510, end: 1570 },
      { start: 1900, end: 1960 },
      { start: 2420, end: 2490 },
      { start: 2780, end: 2840 },
    ],
  },
  {
    userId: 'p4', name: 'Tomasz K.', color: '#a78bfa',
    segments: [
      { start: 365, end: 415 },
      { start: 710, end: 780 },
      { start: 1130, end: 1190 },
      { start: 1590, end: 1640 },
      { start: 1980, end: 2040 },
      { start: 2500, end: 2560 },
      { start: 2860, end: 2880 },
    ],
  },
];

const STAGE_MARKERS = [
  { time: 0, label: 'Otwarcie' },
  { time: 5 * 60, label: 'Etap 1 — Pytania wstępne' },
  { time: 15 * 60, label: 'Etap 2 — Refleksja' },
  { time: 28 * 60, label: 'Luźna rozmowa' },
  { time: 40 * 60, label: 'Etap 3 — Podsumowanie' },
  { time: 46 * 60, label: 'Zakończenie' },
];

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Who is speaking at time t ─────────────────────────────────────────────────
function speakerAt(t: number): Track | null {
  for (const track of MOCK_TRACKS) {
    if (track.segments.some(s => t >= s.start && t < s.end)) return track;
  }
  return null;
}

// ── Current stage ─────────────────────────────────────────────────────────────
function stageAt(t: number): string {
  let label = STAGE_MARKERS[0].label;
  for (const m of STAGE_MARKERS) {
    if (t >= m.time) label = m.label;
  }
  return label;
}

// ── Timeline component ────────────────────────────────────────────────────────
function Timeline({
  currentTime, onSeek, playing,
}: {
  currentTime: number;
  onSeek: (t: number) => void;
  playing: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const LABEL_W = 104;
  const pct = (t: number) => (t / DURATION) * 100;

  const handleRailClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * DURATION);
  }, [onSeek]);

  // Time markers every 5 min
  const markers: number[] = [];
  for (let t = 0; t <= DURATION; t += 5 * 60) markers.push(t);

  return (
    <div className="bg-[#0d1220] border border-white/8 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/80">Timeline spotkania</h3>
          <p className="text-[11px] text-white/35 mt-0.5">Kliknij dowolny punkt aby przejść do tego momentu</p>
        </div>
        <div className="text-xs text-white/40 font-mono">{formatTime(currentTime)} / {formatTime(DURATION)}</div>
      </div>

      <div className="px-5 py-4 select-none">
        {/* Stage markers */}
        <div className="relative h-5 mb-0.5" style={{ marginLeft: LABEL_W }}>
          {STAGE_MARKERS.map(m => (
            <button
              key={m.time}
              onClick={() => onSeek(m.time)}
              className="absolute top-0 -translate-x-1/2 text-[9px] text-htg-warm/60 hover:text-htg-warm whitespace-nowrap transition-colors"
              style={{ left: `${pct(m.time)}%` }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Time axis */}
        <div className="relative h-4 mb-2" style={{ marginLeft: LABEL_W }}>
          {markers.map(t => (
            <div
              key={t}
              className="absolute -translate-x-1/2 text-[10px] text-white/25 font-mono"
              style={{ left: `${pct(t)}%` }}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>

        {/* Track rows */}
        <div className="relative" ref={railRef} style={{ cursor: 'crosshair' }}>
          {MOCK_TRACKS.map(track => (
            <div key={track.userId} className="flex items-center h-9 border-b border-white/5 last:border-0">
              <div
                className="shrink-0 text-xs pr-3 text-right truncate"
                style={{ width: LABEL_W, color: track.color + 'bb' }}
              >
                {track.name}
              </div>
              <div
                className="relative flex-1 h-4 rounded overflow-hidden bg-white/3"
                onClick={handleRailClick}
              >
                {track.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full rounded-sm transition-opacity hover:opacity-100"
                    style={{
                      left: `${pct(seg.start)}%`,
                      width: `${Math.max(0.4, pct(seg.end - seg.start))}%`,
                      backgroundColor: track.color,
                      opacity: 0.75,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20 transition-none"
            style={{
              left: `calc(${LABEL_W}px + ${pct(currentTime)}% * (100% - ${LABEL_W}px) / 100)`,
              background: 'linear-gradient(to bottom, #f59e0b, #f59e0baa)',
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-htg-warm -translate-x-[4px] -translate-y-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mock video area (circles like in meeting room) ────────────────────────────
function MockVideoArea({ currentTime }: { currentTime: number }) {
  const speaker = speakerAt(currentTime);
  const stage   = stageAt(currentTime);

  return (
    <div className="relative rounded-xl overflow-hidden bg-[#060b18]" style={{ aspectRatio: '16/9' }}>
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(30,40,90,0.5),transparent_70%)]" />

      {/* Stage banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-xs text-white/60 font-medium z-10">
        {stage}
      </div>

      {/* Circles */}
      <div className="absolute inset-0 flex items-center justify-center gap-6 flex-wrap p-12">
        {MOCK_TRACKS.map((track, i) => {
          const isSpeaking = speaker?.userId === track.userId;
          const size = isSpeaking ? 120 : 72;
          return (
            <div
              key={track.userId}
              className="flex flex-col items-center gap-1.5 transition-all duration-700"
            >
              <div
                className="rounded-full flex items-center justify-center font-serif text-white/90 transition-all duration-700 shadow-2xl"
                style={{
                  width: size, height: size,
                  background: isSpeaking
                    ? `radial-gradient(circle, ${track.color}30 0%, #09102a 70%)`
                    : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, #0b1124 70%)',
                  boxShadow: isSpeaking ? `0 0 40px 8px ${track.color}40` : 'none',
                  border: isSpeaking ? `2px solid ${track.color}80` : '1px solid rgba(255,255,255,0.12)',
                  fontSize: isSpeaking ? 40 : 22,
                }}
              >
                {track.name[0]}
              </div>
              <span className="text-xs font-medium" style={{ color: isSpeaking ? track.color : 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                {track.name.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Speaker label */}
      {speaker && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs font-medium z-10" style={{ color: speaker.color }}>
          Mówi: {speaker.name}
        </div>
      )}

      {/* Time overlay */}
      <div className="absolute top-4 right-4 font-mono text-xs text-white/30">
        {formatTime(currentTime)}
      </div>
    </div>
  );
}

// ── Main simulator ────────────────────────────────────────────────────────────
export default function PlayerSimulatorClient() {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate playback at 1× speed
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(t => {
          if (t >= DURATION) { setPlaying(false); return DURATION; }
          return t + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  const handleSeek = useCallback((t: number) => {
    setCurrentTime(Math.round(t));
  }, []);

  const handleReset = () => {
    setPlaying(false);
    setCurrentTime(0);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users2 className="w-5 h-5 text-htg-warm" />
            <h2 className="text-xl font-serif font-bold text-htg-fg">Symulator odtwarzacza — Spotkanie HTG</h2>
          </div>
          <p className="text-sm text-htg-fg-muted">Podgląd jak wygląda odtwarzacz z timelineem. Dane mock — 48 min spotkanie, 5 uczestników.</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-htg-warm/10 border border-htg-warm/20">
          <div className="w-1.5 h-1.5 rounded-full bg-htg-warm" />
          <span className="text-xs text-htg-warm font-medium">SYMULATOR</span>
        </div>
      </div>

      {/* Mock video + circles */}
      <MockVideoArea currentTime={currentTime} />

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-htg-sage/15 hover:bg-htg-sage/25 text-htg-sage ring-1 ring-htg-sage/30 text-sm font-medium transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pauza' : 'Odtwórz'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-htg-fg-muted text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <div className="ml-auto text-sm font-mono text-htg-fg-muted">
          <Clock className="w-4 h-4 inline mr-1.5 opacity-50" />
          {formatTime(currentTime)} / {formatTime(DURATION)}
        </div>
      </div>

      {/* Timeline */}
      <Timeline currentTime={currentTime} onSeek={handleSeek} playing={playing} />

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4 mt-2">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <p className="text-xs text-htg-fg-muted mb-1">Aktualny etap</p>
          <p className="text-sm font-semibold text-htg-fg">{stageAt(currentTime)}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <p className="text-xs text-htg-fg-muted mb-1">Mówi teraz</p>
          <p className="text-sm font-semibold" style={{ color: speakerAt(currentTime)?.color ?? 'rgba(255,255,255,0.3)' }}>
            {speakerAt(currentTime)?.name ?? '— cicho —'}
          </p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <p className="text-xs text-htg-fg-muted mb-1">Uczestnicy</p>
          <p className="text-sm font-semibold text-htg-fg">{MOCK_TRACKS.length} osób</p>
        </div>
      </div>
    </div>
  );
}
