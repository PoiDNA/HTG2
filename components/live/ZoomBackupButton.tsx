'use client';

import { useState, useCallback } from 'react';
import { Video } from 'lucide-react';
import type { Room } from 'livekit-client';

interface ZoomBackupButtonProps {
  room: Room;
  /** Icon-only compact variant for tight layouts */
  compact?: boolean;
  /** Called with the URL after successful broadcast — lets the sender also see the overlay */
  onUrlSent?: (url: string) => void;
}

export default function ZoomBackupButton({ room, compact = false, onUrlSent }: ZoomBackupButtonProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleActivate = useCallback(async () => {
    if (sending || sent) return;

    const confirmed = window.confirm(
      'Aktywować awaryjny link Zoom?\n\nLink zostanie natychmiast wyświetlony wszystkim uczestnikom spotkania.',
    );
    if (!confirmed) return;

    setSending(true);
    try {
      // Fetch URL from server (never exposed client-side)
      const res = await fetch('/api/live/zoom-url');
      if (!res.ok) {
        const data = await res.json();
        alert(`Błąd: ${data.error ?? 'Nie udało się pobrać linku Zoom'}`);
        return;
      }
      const { url } = await res.json();

      // Broadcast to all participants via LiveKit data channel
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify({ type: 'zoom_backup', payload: { url } }));
      await room.localParticipant.publishData(payload, { reliable: true });

      setSent(true);
      onUrlSent?.(url);
      // Auto-reset after 10 s so staff can re-send if needed
      setTimeout(() => setSent(false), 10_000);
    } catch (err) {
      alert('Błąd wysyłania. Sprawdź połączenie.');
      console.error(err);
    } finally {
      setSending(false);
    }
  }, [room, sending, sent]);

  if (compact) {
    return (
      <button
        onClick={handleActivate}
        disabled={sending}
        title={sent ? 'Zoom wysłany ✓' : 'Awaryjny link Zoom — wyświetl wszystkim uczestnikom'}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors active:scale-95
          ${sent
            ? 'bg-green-700/80 text-white cursor-default'
            : 'bg-amber-600/80 text-white hover:bg-amber-500/90'
          }
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {sent ? <span className="text-base">✓</span> : <Video className="w-5 h-5" />}
      </button>
    );
  }

  return (
    <button
      onClick={handleActivate}
      disabled={sending}
      title="Awaryjny link Zoom — wyświetl wszystkim uczestnikom"
      className={`flex items-center gap-1.5 px-3 h-10 rounded-full text-xs font-medium transition-colors
        ${sent
          ? 'bg-green-700/80 text-white cursor-default'
          : 'bg-amber-600/80 text-white hover:bg-amber-500/90 active:scale-95'
        }
        disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <Video className="w-4 h-4 flex-shrink-0" />
      {sent ? 'Zoom wysłany ✓' : sending ? 'Wysyłanie…' : 'Awaryjny Zoom'}
    </button>
  );
}
