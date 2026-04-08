'use client';

import { useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Mic, Lock, Trash2, Loader2, Share2, Link as LinkIcon, Infinity as InfinityIcon, XCircle, Copy, Check } from 'lucide-react';

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
  // Count of currently-active (non-revoked, non-expired) share tokens
  // for this recording. Computed server-side in page.tsx. Informational
  // — owner uses this to know whether anyone currently has a link.
  active_shares_count?: number;
}

interface RecordingsPairProps {
  before?: Recording;
  after?: Recording;
  clientName?: string;
  sessionDate?: string;
  // True when the viewer is the owner of these recordings (not staff
  // viewing as admin). Controls delete button + sharing UI visibility.
  isOwner?: boolean;
}

// Sharing mode labels. In Faza 7 only 'private' is the stored default —
// other modes are ephemeral (created by generating a token, dropped by
// revoking all tokens), so the badge always shows 'private'.
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

  // Sharing panel state. Collapsed by default; expands when owner clicks
  // the "Udostępnij" button. Keeps track of the most recently generated
  // share URL so the user can copy it.
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);

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

  const handleCreateShare = useCallback(async (mode: 'link' | 'link_permanent') => {
    if (!recording || sharingInProgress) return;
    setSharingInProgress(true);
    setShareError(null);
    setShareUrl(null);
    setShareCopied(false);
    try {
      const res = await fetch(`/api/live/client-recording/${recording.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Nie udało się utworzyć linku');
      }
      const data = await res.json();
      setShareUrl(data.url);
      setShareExpiresAt(data.expiresAt || null);
      router.refresh();
    } catch (err: unknown) {
      setShareError(err instanceof Error ? err.message : 'Błąd tworzenia linku');
    } finally {
      setSharingInProgress(false);
    }
  }, [recording, sharingInProgress, router]);

  const handleRevokeAllShares = useCallback(async () => {
    if (!recording || sharingInProgress) return;
    if (!confirm('Cofnąć wszystkie aktywne linki do udostępniania? Osoby, którym wysłałeś/aś linki, stracą dostęp natychmiast.')) {
      return;
    }
    setSharingInProgress(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/live/client-recording/${recording.id}/share`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Nie udało się cofnąć linków');
      }
      setShareUrl(null);
      setShareExpiresAt(null);
      router.refresh();
    } catch (err: unknown) {
      setShareError(err instanceof Error ? err.message : 'Błąd cofania linków');
    } finally {
      setSharingInProgress(false);
    }
  }, [recording, sharingInProgress, router]);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard API can fail on http or with user permissions — fall back
      // to asking the user to copy manually. The input is already selected.
    }
  }, [shareUrl]);

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
            {/* Main action row: Share toggle + Delete */}
            <div className="flex gap-1">
              <button
                onClick={() => setShareOpen(o => !o)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  shareOpen
                    ? 'bg-htg-sage/20 text-htg-sage'
                    : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                }`}
                title="Udostępnij nagranie linkiem"
              >
                <Share2 className="w-3 h-3" /> Udostępnij
                {(recording.active_shares_count ?? 0) > 0 && (
                  <span className="ml-1 text-[10px] bg-htg-sage/30 rounded px-1">
                    {recording.active_shares_count}
                  </span>
                )}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs bg-htg-surface text-htg-fg-muted hover:text-red-400 hover:bg-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            </div>

            {deleteError && (
              <p className="text-xs text-red-400 text-center">{deleteError}</p>
            )}

            {/* Expandable sharing panel */}
            {shareOpen && (
              <div className="mt-1 p-2 rounded bg-htg-surface/50 border border-htg-card-border space-y-2">
                <p className="text-[11px] text-htg-fg-muted leading-relaxed">
                  Utwórz link, który możesz wysłać zaufanej osobie. Każdy z linkiem
                  może pobrać nagranie. Możesz cofnąć dostęp w dowolnej chwili.
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleCreateShare('link')}
                    disabled={sharingInProgress}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] bg-htg-sage/20 text-htg-sage hover:bg-htg-sage/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Link ważny 7 dni od teraz"
                  >
                    <LinkIcon className="w-3 h-3" /> Link 7 dni
                  </button>
                  <button
                    onClick={() => handleCreateShare('link_permanent')}
                    disabled={sharingInProgress}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] bg-htg-indigo/20 text-htg-indigo hover:bg-htg-indigo/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Link bez terminu wygaśnięcia (dopóki nie cofniesz)"
                  >
                    <InfinityIcon className="w-3 h-3" /> Link stały
                  </button>
                </div>

                {(recording.active_shares_count ?? 0) > 0 && (
                  <button
                    onClick={handleRevokeAllShares}
                    disabled={sharingInProgress}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] bg-red-950/20 text-red-400 hover:bg-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Cofnij wszystkie aktywne linki natychmiast"
                  >
                    <XCircle className="w-3 h-3" /> Cofnij wszystkie linki
                    ({recording.active_shares_count})
                  </button>
                )}

                {sharingInProgress && (
                  <div className="flex items-center justify-center gap-1 text-[11px] text-htg-fg-muted">
                    <Loader2 className="w-3 h-3 animate-spin" /> Przetwarzanie...
                  </div>
                )}

                {shareUrl && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-htg-fg-muted">
                      Skopiuj link i wyślij:
                      {shareExpiresAt && (
                        <span className="ml-1">
                          (wygasa {new Date(shareExpiresAt).toLocaleDateString('pl-PL')})
                        </span>
                      )}
                    </p>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={shareUrl}
                        readOnly
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 px-2 py-1 text-[10px] font-mono rounded bg-htg-bg border border-htg-card-border text-htg-fg"
                      />
                      <button
                        onClick={handleCopyShareUrl}
                        className="px-2 py-1 rounded text-[11px] bg-htg-sage text-white hover:bg-htg-sage/90 transition-colors"
                        title="Skopiuj do schowka"
                      >
                        {shareCopied ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {shareError && (
                  <p className="text-[11px] text-red-400 text-center">{shareError}</p>
                )}
              </div>
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
