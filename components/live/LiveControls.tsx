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
  const [fsClicked, setFsClicked] = useState(false);

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

      {/* Fullscreen toggle */}
      <button
        onClick={() => { toggleFullscreen(); setFsClicked(true); }}
        title={isFullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
        className={`hidden sm:flex items-center gap-2 rounded-full transition-all ${
          isFullscreen
            ? 'bg-black/30 text-white/70 hover:text-white px-3 py-2'
            : fsClicked
              ? 'bg-white/10 text-white/50 hover:bg-white/25 hover:text-white w-10 h-10 justify-center'
              : 'bg-white/15 border border-white/25 text-white hover:bg-white/25 px-4 py-2.5'
        }`}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        {!isFullscreen && !fsClicked && <span className="text-sm font-medium">Włącz pełny ekran</span>}
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
