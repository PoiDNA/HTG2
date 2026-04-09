'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, AlertCircle } from 'lucide-react';

interface SpeakingEvent {
  user_id: string;
  display_name: string;
  started_offset_seconds: number;
  ended_offset_seconds: number;
}

interface Track {
  userId: string;
  name: string;
  color: string;
  segments: Array<{ start: number; end: number }>;
}

// Stable color palette per participant
const TRACK_COLORS = [
  '#4ade80', '#60a5fa', '#f59e0b', '#f472b6',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8',
];

function buildTracks(events: SpeakingEvent[], duration: number): Track[] {
  const byUser = new Map<string, Track>();
  let colorIdx = 0;
  for (const ev of events) {
    if (!byUser.has(ev.user_id)) {
      byUser.set(ev.user_id, {
        userId: ev.user_id,
        name: ev.display_name,
        color: TRACK_COLORS[colorIdx++ % TRACK_COLORS.length],
        segments: [],
      });
    }
    byUser.get(ev.user_id)!.segments.push({
      start: ev.started_offset_seconds,
      end: Math.min(ev.ended_offset_seconds, duration),
    });
  }
  return Array.from(byUser.values());
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Stable per-browser device_id for single-device concurrency limit
function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'htg_meeting_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function MeetingTimeline({
  duration,
  currentTime,
  tracks,
  onSeek,
}: {
  duration: number;
  currentTime: number;
  tracks: Track[];
  onSeek: (t: number) => void;
}) {
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const LABEL_W = 96;

  const handleRowClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }, [duration, onSeek]);

  // Time markers every 30s or 60s
  const step = duration > 600 ? 120 : duration > 300 ? 60 : 30;
  const markers: number[] = [];
  for (let t = 0; t <= duration; t += step) markers.push(t);

  return (
    <div className="relative bg-htg-card border border-htg-card-border rounded-xl overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-htg-card-border">
        <h3 className="text-sm font-semibold text-htg-fg">Timeline — kto kiedy mówił</h3>
        <p className="text-xs text-htg-fg-muted mt-0.5">Kliknij dowolny punkt aby przejść do tego momentu</p>
      </div>

      <div className="p-4 select-none">
        {/* Time axis */}
        <div className="relative h-5 mb-1" style={{ paddingLeft: LABEL_W }}>
          {markers.map(t => (
            <div
              key={t}
              className="absolute top-0 text-[10px] text-htg-fg-muted/50 -translate-x-1/2"
              style={{ left: `${pct(t)}%` }}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>

        {/* Participant rows */}
        <div className="relative">
          {tracks.map((track) => (
            <div key={track.userId} className="flex items-center h-9 border-b border-htg-card-border/50 last:border-0">
              {/* Name label */}
              <div
                className="shrink-0 text-xs text-htg-fg-muted pr-3 text-right truncate"
                style={{ width: LABEL_W }}
              >
                {track.name}
              </div>
              {/* Segments track */}
              <div
                className="relative flex-1 h-5 cursor-pointer rounded overflow-hidden bg-htg-surface/50"
                onClick={handleRowClick}
              >
                {track.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                    style={{
                      left: `${pct(seg.start)}%`,
                      width: `${Math.max(0.5, pct(seg.end - seg.start))}%`,
                      backgroundColor: track.color,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Playhead — absolutely positioned over rows */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-htg-warm/80 pointer-events-none z-10"
              style={{ left: `calc(${LABEL_W}px + ${pct(currentTime)}% * (100% - ${LABEL_W}px) / 100)` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * MeetingPlayerClient — HTG Meeting composite recording playback.
 *
 * PR #7 rewrite: fetches signed URL from /api/video/htg-meeting-recording-token
 * (instead of the old Bunny Stream embed iframe — the new pipeline serves
 * audio-only composite MP4 from Bunny Storage via Pull Zone).
 *
 * Error states:
 *  - null recordingId     → recording not ready yet
 *  - token fetch failed   → display server message (allowed: false)
 *  - 409 Conflict         → "playing on another device"
 *  - 503 Service Unavail  → "CDN not configured" (fail-closed)
 */
export default function MeetingPlayerClient({
  recordingId,
  durationSeconds,
  speakingEvents,
}: {
  recordingId: string | null;
  durationSeconds: number;
  speakingEvents: SpeakingEvent[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<{ title: string; message: string } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const tracks = buildTracks(speakingEvents, durationSeconds);

  // Fetch playback token on mount (once recordingId is known)
  useEffect(() => {
    if (!recordingId) return;
    let cancelled = false;

    (async () => {
      setTokenLoading(true);
      setTokenError(null);
      try {
        const res = await fetch('/api/video/htg-meeting-recording-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordingId, deviceId: getDeviceId() }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.allowed && data.url) {
          setMediaUrl(data.url);
        } else {
          setTokenError({
            title: data.title ?? 'Nagranie niedostępne',
            message: data.message ?? 'Spróbuj ponownie za chwilę.',
          });
        }
      } catch (e) {
        if (cancelled) return;
        setTokenError({
          title: 'Błąd połączenia',
          message: e instanceof Error ? e.message : 'Nie udało się pobrać nagrania.',
        });
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [recordingId]);

  const handleSeek = useCallback((t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setCurrentTime(t);
    }
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !muted;
    setMuted(!muted);
  };

  return (
    <div className="space-y-4">
      {/* Player */}
      <div className="relative bg-htg-card border border-htg-card-border rounded-xl p-6">
        {tokenLoading && (
          <div className="text-center py-8">
            <p className="text-sm text-htg-fg-muted">Ładowanie nagrania...</p>
          </div>
        )}

        {tokenError && (
          <div className="flex items-start gap-3 py-4">
            <AlertCircle className="w-5 h-5 text-htg-warm shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-htg-fg">{tokenError.title}</h3>
              <p className="text-sm text-htg-fg-muted mt-1">{tokenError.message}</p>
            </div>
          </div>
        )}

        {!recordingId && !tokenLoading && !tokenError && (
          <div className="text-center py-8">
            <p className="text-sm text-htg-fg-muted">Nagranie jeszcze niedostępne.</p>
          </div>
        )}

        {mediaUrl && (
          <>
            <audio
              ref={audioRef}
              src={mediaUrl}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              preload="metadata"
            />
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-htg-warm text-htg-bg flex items-center justify-center hover:bg-htg-warm/90 transition-colors"
                aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div className="flex-1 text-sm text-htg-fg-muted">
                {formatTime(currentTime)} / {formatTime(durationSeconds)}
              </div>
              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-full text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface/50 flex items-center justify-center transition-colors"
                aria-label={muted ? 'Włącz dźwięk' : 'Wycisz'}
              >
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Timeline */}
      {tracks.length > 0 ? (
        <MeetingTimeline
          duration={durationSeconds}
          currentTime={currentTime}
          tracks={tracks}
          onSeek={handleSeek}
        />
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-sm text-htg-fg-muted">Brak danych o aktywności mowy dla tego spotkania</p>
        </div>
      )}
    </div>
  );
}
