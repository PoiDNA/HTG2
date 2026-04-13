'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';
import { Mic, Loader2 } from 'lucide-react';

export default function CreateRoomButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/live/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd tworzenia pokoju');
        return;
      }
      // Room created — navigate to live session
      const sessionId = data.session?.id || data.id;
      if (sessionId) {
        router.push({pathname: '/live/[sessionId]', params: {sessionId}} as any);
      } else {
        router.refresh();
      }
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="bg-htg-sage text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-htg-sage/80 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
        Otwórz pokój
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
