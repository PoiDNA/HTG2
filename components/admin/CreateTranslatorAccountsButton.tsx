'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';

type ResultEntry = {
  email: string;
  status: string;
  userId?: string;
};

export default function CreateTranslatorAccountsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/admin/create-translator-accounts', { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setResults(data.results ?? []);
      // Refresh server data so karta reflects new account state
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Nieznany błąd');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-htg-sage text-white hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {loading ? 'Synchronizuję…' : 'Utwórz / zsynchronizuj konta tłumaczy'}
      </button>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {results && results.length > 0 && (
        <ul className="space-y-1 text-sm">
          {results.map((r) => {
            const ok = r.status === 'created' || r.status === 'already_exists';
            return (
              <li
                key={r.email}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  ok ? 'bg-htg-sage/10 text-htg-sage' : 'bg-red-50 text-red-700'
                }`}
              >
                {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="font-medium">{r.email}</span>
                <span className="text-xs opacity-75">— {r.status}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
