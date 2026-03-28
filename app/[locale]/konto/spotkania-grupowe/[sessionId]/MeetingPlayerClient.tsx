'use client';

import { useRef, useState, useCallback } from 'react';
import { Play } from 'lucide-react';

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

export default function MeetingPlayerClient({
  bunnyVideoId,
  bunnyLibraryId,
  durationSeconds,
  speakingEvents,
}: {
  bunnyVideoId: string | null;
  bunnyLibraryId: string | null;
  durationSeconds: number;
  speakingEvents: SpeakingEvent[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const tracks = buildTracks(speakingEvents, durationSeconds);

  const handleSeek = useCallback((t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  // Bunny embed URL
  const embedUrl = bunnyVideoId && bunnyLibraryId
    ? `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}?autoplay=false&responsive=true`
    : null;

  return (
    <div className="space-y-4">
      {/* Video player */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-htg-surface/50 flex items-center justify-center mx-auto mb-3">
                <Play className="w-8 h-8 text-htg-fg-muted/40" />
              </div>
              <p className="text-htg-fg-muted/60 text-sm">Nagranie jeszcze niedostępne</p>
            </div>
          </div>
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
