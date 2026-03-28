'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift } from 'lucide-react';

export default function ClaimButton({ token, locale }: { token: string; locale: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const claim = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gift/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok || data.alreadyClaimed) {
        setDone(true);
        setTimeout(() => router.push(`/${locale}/konto/sesje-indywidualne`), 2000);
      } else {
        setError(data.error ?? 'Wystąpił błąd');
      }
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-4">
        <p className="text-emerald-600 font-medium">Sesja odebrana! Przekierowuję…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={claim}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-htg-warm text-white font-medium hover:bg-htg-warm/90 disabled:opacity-50 transition-colors"
      >
        <Gift className="w-5 h-5" />
        {loading ? 'Odbieranie…' : 'Odbierz sesję na swoje konto'}
      </button>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  );
}
