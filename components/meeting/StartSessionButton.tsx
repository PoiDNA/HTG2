'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';

interface StartSessionButtonProps {
  meetingId: string;
  locale: string;
}

export default function StartSessionButton({ meetingId, locale }: StartSessionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/htg-meeting/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd'); return; }
      router.push(`/${locale}/spotkanie/${data.sessionId}`);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleStart}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 disabled:opacity-40 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Uruchom sesję
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
