'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface RegisterButtonProps {
  sessionId: string;
  initialRegistered: boolean;
  isFull: boolean;
}

export default function RegisterButton({ sessionId, initialRegistered, isFull }: RegisterButtonProps) {
  const [registered, setRegistered] = useState(initialRegistered);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const handleRegister = async () => {
    if (!consentAccepted) {
      setError('Wymagana akceptacja zgody na nagrywanie.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/htg-meeting/session/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, recordingConsent: consentAccepted }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd rejestracji'); return; }
      setRegistered(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/htg-meeting/session/self-register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) setRegistered(false);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-htg-sage font-medium">
          <CheckCircle2 className="w-4 h-4" />
          Zapisano
        </span>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-htg-surface hover:bg-htg-card-border text-htg-fg-muted transition-colors"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Wypisz się'}
        </button>
      </div>
    );
  }

  if (isFull) {
    return (
      <span className="text-xs px-3 py-1.5 rounded-lg bg-htg-surface text-htg-fg-muted/60">
        Brak miejsc
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 max-w-sm">
      <label className="flex items-start gap-2 text-xs text-htg-fg-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => setConsentAccepted(e.target.checked)}
          className="mt-0.5 accent-htg-sage cursor-pointer"
        />
        <span className="leading-snug">
          Wyrażam zgodę na nagrywanie spotkania (audio). Nagranie będzie dostępne
          dla uczestników bezterminowo w panelu użytkownika. Per-speaker track audio
          będzie wykorzystany do analizy po stronie administratora. Zgodę mogę wycofać
          w każdej chwili — cofnięcie blokuje mój dalszy dostęp do nagrania, ale nie
          usuwa istniejących kopii.
        </span>
      </label>
      <button
        onClick={handleRegister}
        disabled={loading || !consentAccepted}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Zapisz się
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
