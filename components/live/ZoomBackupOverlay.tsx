'use client';

import { useEffect } from 'react';
import { ExternalLink, X, Video } from 'lucide-react';

interface ZoomBackupOverlayProps {
  url: string | null;
  onDismiss: () => void;
}

export default function ZoomBackupOverlay({ url, onDismiss }: ZoomBackupOverlayProps) {
  // Play a subtle alert sound when it appears
  useEffect(() => {
    if (!url) return;
    const audio = new Audio('https://htg2-cdn.b-cdn.net/sfx/alert.mp3');
    audio.volume = 0.4;
    audio.play().catch(() => {});
  }, [url]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div className="relative w-full max-w-md bg-htg-indigo border border-amber-500/40
        rounded-2xl shadow-2xl p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
            rounded-full bg-white/10 hover:bg-white/20 text-htg-cream/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
          <Video className="w-8 h-8 text-amber-400" />
        </div>

        {/* Heading */}
        <div>
          <h2 className="text-xl font-semibold text-htg-cream">Tryb awaryjny — Zoom</h2>
          <p className="text-htg-cream/60 text-sm mt-1">
            Wystąpił problem techniczny. Przenosimy spotkanie na Zoom.
          </p>
        </div>

        {/* CTA */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl
            bg-amber-500 hover:bg-amber-400 text-white font-semibold text-base
            transition-colors active:scale-95"
        >
          <ExternalLink className="w-5 h-5" />
          Dołącz do Zoom
        </a>

        <p className="text-htg-cream/40 text-xs">
          Kliknij, aby otworzyć spotkanie w aplikacji Zoom lub przeglądarce.
        </p>
      </div>
    </div>
  );
}
