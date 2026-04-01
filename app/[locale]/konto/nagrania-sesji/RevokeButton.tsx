'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function RevokeButton({ recordingId, isPara }: { recordingId: string; isPara: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs text-htg-fg-muted">Nagranie zostało usunięte z Twojej biblioteki</span>;
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        {isPara && (
          <p className="text-xs text-amber-300/80">
            Uwaga: ta akcja trwale usunie nagranie również z biblioteki Twojego partnera/partnerki.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            disabled={loading}
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
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '...' : 'Tak, cofnij zgodę'}
          </button>
          <button
            onClick={() => setConfirming(false)}
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
      title={isPara
        ? 'Spowoduje trwałe usunięcie nagrania dla obu uczestników'
        : 'Cofnięcie zgody usunie nagranie z Twojej biblioteki'}
    >
      <Trash2 className="w-3 h-3" />
      {isPara ? 'Cofnij zgodę na udostępnianie' : 'Cofnij zgodę i usuń nagranie'}
    </button>
  );
}
