'use client';

import { useState, useCallback } from 'react';
import { Video } from 'lucide-react';
import type { Room } from 'livekit-client';
import { DataPacket_Kind } from 'livekit-client';

interface ZoomBackupButtonProps {
  room: Room;
}

export default function ZoomBackupButton({ room }: ZoomBackupButtonProps) {
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
      await room.localParticipant.publishData(payload, { reliable: true, kind: DataPacket_Kind.RELIABLE });

      setSent(true);
      // Auto-reset after 10 s so staff can re-send if needed
      setTimeout(() => setSent(false), 10_000);
    } catch (err) {
      alert('Błąd wysyłania. Sprawdź połączenie.');
      console.error(err);
    } finally {
      setSending(false);
    }
  }, [room, sending, sent]);

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
