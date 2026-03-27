'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';

export function ResolveFlagButton({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleResolve() {
    if (!confirm('Oznaczyć flagę jako rozwiązaną?')) return;
    setLoading(true);
    try {
      await fetch('/api/admin/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagId, action: 'resolve' }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleResolve}
      disabled={loading}
      title="Oznacz jako rozwiązaną"
      className="p-2 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-sage transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
    </button>
  );
}
