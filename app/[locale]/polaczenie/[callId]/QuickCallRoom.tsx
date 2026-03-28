'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import SessionAnimation from '@/components/live/SessionAnimation';
import { VoiceWaveform } from '@/components/live/AudioWaveTile';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickCallRoomProps {
  callId: string;
  isCreator: boolean;
  locale: string;
}

// ─── Circle size — same visual weight as the assistant overlay in individual session
const CIRCLE_SIZE = 160; // px
const CIRCLE_SIZE_SM = 128; // px — when 5+ participants

// ─── Seed helper ──────────────────────────────────────────────────────────────

function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100) / 10;
}

// ─── Participant circle ───────────────────────────────────────────────────────

function ParticipantCircle({
  participant: p,
  size,
}: {
  participant: Participant;
  size: number;
}) {
  const speaking = p.isSpeaking;
  const muted    = !p.isMicrophoneEnabled;
  const initial  = (p.name ?? p.identity)?.[0]?.toUpperCase() ?? '?';
  const name     = p.name || (p.isLocal ? 'Ty' : 'Uczestnik');
  const seed     = idSeed(p.identity);
  const waveW    = Math.round(size * 0.65);
  const waveH    = Math.round(size * 0.18);
  const avatarSz = Math.round(size * 0.40);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative flex-shrink-0 rounded-full overflow-hidden shadow-2xl
          flex flex-col items-center justify-center transition-all duration-300
          ${speaking
            ? 'ring-4 ring-[#4ade80]/80 shadow-[0_0_40px_10px_rgba(74,222,128,0.18)]'
            : 'ring-2 ring-white/20'}`}
        style={{
          width: size,
          height: size,
          background: speaking
            ? 'radial-gradient(circle, rgba(74,222,128,0.14) 0%, #09102a 65%)'
            : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, #0b1124 70%)',
        }}
      >
        {/* Avatar */}
        <div
          className="rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
          style={{
            width: avatarSz,
            height: avatarSz,
            background: speaking ? 'rgba(74,222,128,0.20)' : 'rgba(255,255,255,0.08)',
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
        <div className="mt-2 overflow-hidden" style={{ width: waveW }}>
          <VoiceWaveform
            speaking={speaking}
            muted={muted}
            height={waveH}
            width={waveW}
            seed={seed}
          />
        </div>

        {/* Name */}
        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center py-1 px-1">
          <span className="text-[11px] text-white/85 font-medium truncate block">{name}</span>
        </div>

        {/* Muted badge */}
        {muted && (
          <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Local badge */}
        {p.isLocal && (
          <div className="absolute top-2 left-2 bg-white/10 rounded-full px-1.5 py-0.5">
            <span className="text-[9px] text-white/70 font-medium">Ty</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Media controls ───────────────────────────────────────────────────────────

function CallControls({
  isCreator,
  callId,
  onEnd,
}: {
  isCreator: boolean;
  callId: string;
  onEnd: () => void;
}) {
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);

  const toggleMic = () => {
    room.localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(!micOn);
  };

  const toggleCam = () => {
    room.localParticipant.setCameraEnabled(!camOn);
    setCamOn(!camOn);
  };

  return (
    <div className="flex items-center gap-3">
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
        onClick={toggleCam}
        className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors ${
          camOn
            ? 'bg-white/10 hover:bg-white/15 text-white/80'
            : 'bg-white/5 hover:bg-white/10 text-white/50'
        }`}
      >
        {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        Kamera
      </button>

      <button
        onClick={onEnd}
        className="flex items-center gap-2 px-5 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 ring-1 ring-red-500/30 text-sm font-medium transition-colors"
      >
        <PhoneOff className="w-4 h-4" />
        {isCreator ? 'Zakończ dla wszystkich' : 'Rozłącz się'}
      </button>
    </div>
  );
}

// ─── Inner room (has access to LiveKit context) ───────────────────────────────

function QuickCallInner({
  callId,
  isCreator,
  onEnd,
}: {
  callId: string;
  isCreator: boolean;
  onEnd: () => void;
}) {
  const participants = useParticipants();
  const count = participants.length;
  const circleSize = count >= 5 ? CIRCLE_SIZE_SM : CIRCLE_SIZE;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-8 px-6">
      {/* Participant count */}
      <div className="flex items-center gap-2 text-white/40 text-xs">
        <Users className="w-3.5 h-3.5" />
        {count} {count === 1 ? 'osoba' : count < 5 ? 'osoby' : 'osób'} w połączeniu
      </div>

      {/* Circle grid */}
      <div
        className="flex flex-wrap items-center justify-center"
        style={{ gap: 24, maxWidth: Math.min(count, 4) * (circleSize + 24) + 200 }}
      >
        {participants.map(p => (
          <ParticipantCircle key={p.identity} participant={p} size={circleSize} />
        ))}
      </div>

      {/* Controls */}
      <CallControls isCreator={isCreator} callId={callId} onEnd={onEnd} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuickCallRoom({ callId, isCreator, locale }: QuickCallRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [livekitUrl, setLivekitUrl] = useState('');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);

  // Fetch token on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quick-call/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Błąd dołączania'); return; }
        setToken(data.token);
        setLivekitUrl(data.url);
      } catch {
        setError('Błąd połączenia');
      }
    })();
  }, [callId]);

  const handleEnd = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnded(true);

    if (isCreator) {
      await fetch('/api/quick-call/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(() => {});
    }

    router.push(`/${locale}/prowadzacy`);
  }, [callId, isCreator, locale, router]);

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
        <div className="text-center text-white space-y-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => router.push(`/${locale}/prowadzacy`)}
            className="px-6 py-2 rounded-xl bg-htg-sage text-white text-sm"
          >
            Wróć do panelu
          </button>
        </div>
      </div>
    );
  }

  if (!token || ended) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-htg-indigo">
        <div className="w-8 h-8 rounded-full border-2 border-htg-warm border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-htg-indigo overflow-hidden">
      {/* Particle background */}
      <SessionAnimation variant={1} opacity={0.5} active />

      {/* Header bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 py-4
        bg-gradient-to-b from-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-white/70 text-sm font-medium">Połączenie aktywne</span>
        </div>
        <div className="text-white/30 text-xs">HTG</div>
      </div>

      {/* Room */}
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect
        audio
        video={false}
        options={{
          audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
        }}
        className="absolute inset-0"
      >
        <RoomAudioRenderer />
        <QuickCallInner callId={callId} isCreator={isCreator} onEnd={handleEnd} />
      </LiveKitRoom>
    </div>
  );
}
