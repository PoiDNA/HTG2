'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff, Loader2 } from 'lucide-react';

export function BlockUserButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleBlock() {
    const reason = prompt(`Powód blokady konta ${userEmail}:`);
    if (!reason) return;
    setLoading(true);
    try {
      await fetch('/api/admin/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'block', userId, reason }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleBlock}
      disabled={loading}
      title="Zablokuj konto"
      className="p-2 rounded-lg hover:bg-red-900/20 text-htg-fg-muted hover:text-red-400 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
    </button>
  );
}
