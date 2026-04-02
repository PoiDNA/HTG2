'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function RevokeButton({ recordingId, isPara }: { recordingId: string; isPara: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (done) {
    return <span className="text-xs text-htg-sage font-medium">Twoje nagranie zostało usunięte.</span>;
  }

  if (confirming) {
    const canDelete = confirmText.trim().toLowerCase() === 'usuwam';

    return (
      <div className="flex flex-col gap-2">
        {isPara && (
          <p className="text-xs text-amber-300/80">
            Uwaga: ta akcja trwale usunie nagranie również z biblioteki Twojego partnera/partnerki.
          </p>
        )}
        <p className="text-xs text-htg-fg-muted">
          Potwierdź trwałe usunięcie nagrania wpisując: <strong className="text-htg-fg">usuwam</strong>
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="usuwam"
            className="px-2 py-1.5 text-xs rounded border border-htg-card-border bg-htg-bg text-htg-fg w-24 focus:outline-none focus:ring-1 focus:ring-red-500/50"
            autoFocus
          />
          <button
            disabled={!canDelete || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await fetch('/api/video/booking-recording-revoke', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ recordingId }),
                });
                setDone(true);
              } catch {
                setLoading(false);
              }
            }}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'Usuń'}
          </button>
          <button
            onClick={() => { setConfirming(false); setConfirmText(''); }}
            className="text-xs text-htg-fg-muted hover:text-htg-fg"
          >
            Anuluj
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 text-xs text-htg-fg-muted hover:text-red-400 transition-colors"
      title="Trwale usuń nagranie"
    >
      <Trash2 className="w-3 h-3" />
      Usuń
    </button>
  );
}
