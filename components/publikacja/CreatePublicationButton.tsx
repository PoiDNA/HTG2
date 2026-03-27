'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Loader2 } from 'lucide-react';

interface Props {
  liveSessionId: string;
}

export function CreatePublicationButton({ liveSessionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/publikacja/from-live-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveSessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        // If already exists, navigate to it
        if (res.status === 409 && json.publicationId) {
          router.push(`/pl/publikacja/sesje/${json.publicationId}`);
          return;
        }
        setError(json.error || 'Błąd');
        return;
      }
      router.push(`/pl/publikacja/sesje/${json.publication.id}`);
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-indigo text-white text-sm font-medium
                   hover:bg-htg-indigo/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
        Utwórz publikację
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
