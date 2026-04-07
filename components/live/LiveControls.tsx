'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Maximize, Minimize } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface LiveControlsProps {
  backUrl?: string;
  /** When true (default), wraps buttons in an absolute-positioned overlay container */
  standalone?: boolean;
}

export default function LiveControls({ backUrl = '/pl/konto/sesje-indywidualne', standalone = true }: LiveControlsProps) {
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

  const buttons = (
    <>
      {/* Back button */}
      <button
        onClick={() => router.push(backUrl)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/70 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć
      </button>

      {/* Fullscreen toggle — hidden on mobile */}
      <button
        onClick={toggleFullscreen}
        className={`hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-md text-sm font-medium transition-all ${
          isFullscreen
            ? 'bg-black/30 text-white/70 hover:text-white'
            : 'bg-white/15 border border-white/25 text-white hover:bg-white/25'
        }`}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-5 h-5" />}
        {isFullscreen ? 'Wyjdź' : 'Włącz pełny ekran'}
      </button>
    </>
  );

  if (!standalone) return buttons;

  return (
    <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none
      [&>button]:pointer-events-auto">
      {buttons}
    </div>
  );
}
