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
    <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
      {/* Back button */}
      <button
        onClick={() => router.push(backUrl)}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/70 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć
      </button>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/70 hover:text-white text-sm transition-colors"
        title={isFullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        {isFullscreen ? 'Wyjdź' : 'Pełny ekran'}
      </button>
    </div>
  );
}
