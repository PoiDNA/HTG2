'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';
import { Trash2 } from 'lucide-react';

export default function DeleteSessionButton({ bookingId, locale }: { bookingId: string; locale: string }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleDelete() {
    if (input.trim().toLowerCase() !== 'usuwam') return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/booking/${bookingId}/delete`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/prowadzacy/sesje');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Nie udało się usunąć sesji.');
      }
    } catch {
      setError('Błąd połączenia.');
    }
    setLoading(false);
  }

  const canDelete = input.trim().toLowerCase() === 'usuwam';

  return (
    <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-6 space-y-3">
      <h2 className="text-base font-serif font-bold text-red-400 flex items-center gap-2">
        <Trash2 className="w-4 h-4" />
        Usuń sesję
      </h2>
      <p className="text-sm text-htg-fg-muted">
        Aby usunąć tę sesję, wpisz <span className="font-mono font-bold text-red-400">usuwam</span> i kliknij przycisk.
      </p>
      <div className="flex gap-3 items-center">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="usuwam"
          className="px-3 py-2 bg-htg-surface border border-red-900/40 rounded-lg text-htg-fg text-sm placeholder:text-htg-fg-muted/40 focus:outline-none focus:ring-2 focus:ring-red-500/30 w-36"
        />
        <button
          onClick={handleDelete}
          disabled={!canDelete || loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {loading ? 'Usuwanie...' : 'Usuń sesję'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
