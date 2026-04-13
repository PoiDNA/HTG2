'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2 } from 'lucide-react';

export default function AcceptInviteButton({ token, locale }: { token: string; locale: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/companion/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      router.push(`/${locale}/konto/sesje-indywidualne`);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
          bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 ring-1 ring-rose-500/30
          text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
        Dołącz do sesji jako partner
      </button>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
    </div>
  );
}
