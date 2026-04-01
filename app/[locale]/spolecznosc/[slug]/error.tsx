'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Community Error]', error);
  }, [error]);

  return (
    <div className="text-center py-16">
      <p className="text-htg-fg-muted mb-4 text-sm">
        Wystąpił błąd podczas ładowania społeczności.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 mx-auto px-4 py-2 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Spróbuj ponownie
      </button>
    </div>
  );
}
