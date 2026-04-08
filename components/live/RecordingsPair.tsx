'use client';

import { useRef, useCallback } from 'react';
import { Video, Mic, Lock } from 'lucide-react';

interface Recording {
  id: string;
  type: 'before' | 'after';
  format: 'video' | 'audio';
  storage_url: string;
  duration_seconds: number;
  sharing_mode: string;
  created_at: string;
}

interface RecordingsPairProps {
  before?: Recording;
  after?: Recording;
  clientName?: string;
  sessionDate?: string;
}

// Informational labels only — showing the current sharing mode as a static badge.
// Interactive sharing controls were removed in Faza 0.A because the backend
// never implemented the onSharingChange callback; clicking would have given
// the user a false sense of privacy control (placebo privacy). Real sharing
// modes will be implemented in Faza 7 with a proper backend. Until then the
// badge shows the effective mode (always 'private' at insert time).
const SHARING_LABELS: Record<string, { icon: typeof Lock; label: string }> = {
  private: { icon: Lock, label: 'Prywatne' },
};

function RecordingCard({ recording, label }: {
  recording: Recording | undefined;
  label: string;
}) {
  const eventIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);

  const handlePlay = useCallback(() => {
    if (!recording) return;
    startTimeRef.current = Date.now();
    fetch('/api/analytics/recording-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', recordingId: recording.id }),
    }).then(r => r.json()).then(d => { if (d.eventId) eventIdRef.current = d.eventId; }).catch(() => {});
  }, [recording]);

  const handlePause = useCallback(() => {
    const eventId = eventIdRef.current;
    if (!eventId) return;
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    eventIdRef.current = null;
    fetch('/api/analytics/recording-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', eventId, durationSeconds: duration }),
    }).catch(() => {});
  }, []);
  if (!recording) {
    return (
      <div className="flex-1 bg-htg-surface/50 border border-htg-card-border rounded-xl p-4 flex items-center justify-center min-h-[120px]">
        <p className="text-htg-fg-muted/40 text-sm">{label} — brak nagrania</p>
      </div>
    );
  }

  const Icon = recording.format === 'video' ? Video : Mic;
  // Only 'private' is a valid mode in Faza 0–3; any other value (legacy/future) falls back to it.
  const sharing = SHARING_LABELS.private;
  const SharingIcon = sharing.icon;
  const mins = Math.floor(recording.duration_seconds / 60);
  const secs = recording.duration_seconds % 60;

  return (
    <div className="flex-1 bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      {/* Player */}
      <div className="relative bg-black">
        {recording.format === 'video' ? (
          <video
            src={recording.storage_url}
            controls
            playsInline
            controlsList="nodownload"
            className="w-full aspect-video object-cover"
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handlePause}
          />
        ) : (
          <div className="p-6 flex items-center justify-center">
            <audio
              src={recording.storage_url}
              controls
              controlsList="nodownload"
              className="w-full"
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handlePause}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-htg-fg-muted">
            <Icon className="w-3 h-3" />
            {label} · {mins}:{String(secs).padStart(2, '0')}
          </span>
          <span className="flex items-center gap-1 text-xs text-htg-fg-muted">
            <SharingIcon className="w-3 h-3" />
            {sharing.label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RecordingsPair({
  before,
  after,
  clientName,
  sessionDate,
}: RecordingsPairProps) {
  return (
    <div className="space-y-2">
      {(clientName || sessionDate) && (
        <div className="flex items-center gap-2 text-sm text-htg-fg-muted">
          {clientName && <span className="font-medium text-htg-fg">{clientName}</span>}
          {sessionDate && <span>· {sessionDate}</span>}
        </div>
      )}
      <div className="flex gap-3 flex-col sm:flex-row">
        <RecordingCard recording={before} label="Przed sesją" />
        <RecordingCard recording={after} label="Po sesji" />
      </div>
    </div>
  );
}
