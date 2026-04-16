'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ProwadzacyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[/prowadzacy] client error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <AlertTriangle className="w-10 h-10 text-htg-warm mb-4" />
      <h2 className="text-lg font-serif font-bold text-htg-fg mb-2">
        Coś poszło nie tak
      </h2>
      <p className="text-sm text-htg-fg-muted mb-6 max-w-sm">
        {error.message || 'Wystąpił nieoczekiwany błąd w panelu prowadzącego.'}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:opacity-90"
      >
        <RefreshCw className="w-4 h-4" />
        Spróbuj ponownie
      </button>
      {error.digest && (
        <p className="mt-4 text-xs text-htg-fg-muted/50">ID błędu: {error.digest}</p>
      )}
    </div>
  );
}
