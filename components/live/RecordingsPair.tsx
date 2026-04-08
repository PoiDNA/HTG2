'use client';

import { useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Mic, Lock, Trash2, Loader2 } from 'lucide-react';

interface Recording {
  id: string;
  type: 'before' | 'after';
  format: 'video' | 'audio';
  // playback_url is signed server-side (4h TTL via signPrivateCdnUrl with
  // BUNNY_PRIVATE_TOKEN_KEY against htg-private.b-cdn.net pull zone). The
  // raw `storage_url` from DB is just the path within the htg2 storage zone,
  // e.g. "client-recordings/<uid>/<bid>/<file>.webm".
  playback_url: string;
  duration_seconds: number;
  sharing_mode: string;
  created_at: string;
}

interface RecordingsPairProps {
  before?: Recording;
  after?: Recording;
  clientName?: string;
  sessionDate?: string;
  // True when the viewer is the owner of these recordings (not staff
  // viewing as admin). Controls delete button visibility.
  isOwner?: boolean;
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

function RecordingCard({ recording, label, isOwner }: {
  recording: Recording | undefined;
  label: string;
  isOwner?: boolean;
}) {
  const router = useRouter();
  const eventIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleDelete = useCallback(async () => {
    if (!recording || deleting) return;
    if (!confirm(`Na pewno chcesz usunąć nagranie ${label.toLowerCase()}? Operacji nie można cofnąć po 14 dniach.`)) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/live/client-recording/${recording.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Nie udało się usunąć nagrania');
      }
      // Refresh the server component to drop the deleted row from the list.
      router.refresh();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Błąd usuwania');
      setDeleting(false);
    }
  }, [recording, deleting, label, router]);

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
            src={recording.playback_url}
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
              src={recording.playback_url}
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

        {isOwner && (
          <div className="flex flex-col gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs bg-htg-surface text-htg-fg-muted hover:text-red-400 hover:bg-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Usuń nagranie (z 14-dniowym okresem przywracania)"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Usuwanie...
                </>
              ) : (
                <>
                  <Trash2 className="w-3 h-3" /> Usuń
                </>
              )}
            </button>
            {deleteError && (
              <p className="text-xs text-red-400 text-center">{deleteError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecordingsPair({
  before,
  after,
  clientName,
  sessionDate,
  isOwner,
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
        <RecordingCard recording={before} label="Przed sesją" isOwner={isOwner} />
        <RecordingCard recording={after} label="Po sesji" isOwner={isOwner} />
      </div>
    </div>
  );
}
