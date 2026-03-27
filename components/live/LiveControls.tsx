'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Maximize, Minimize } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface LiveControlsProps {
  backUrl?: string;
}

export default function LiveControls({ backUrl = '/pl/konto/sesje-indywidualne' }: LiveControlsProps) {
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  return (
    <>
      {/* Top bar: Back + Exit fullscreen (when in fullscreen) */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => router.push(backUrl)}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/70 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć
        </button>

        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/70 hover:text-white text-sm transition-colors"
          >
            <Minimize className="w-4 h-4" />
            Wyjdź
          </button>
        )}
      </div>

      {/* Center: Enter fullscreen prompt (when not in fullscreen) */}
      {!isFullscreen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <button
            onClick={toggleFullscreen}
            className="pointer-events-auto flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all text-lg"
          >
            <Maximize className="w-6 h-6" />
            Włącz pełny ekran
          </button>
        </div>
      )}
    </>
  );
}
