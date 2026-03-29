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
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="relative w-full max-w-lg bg-htg-card border border-blue-500/40
        rounded-3xl shadow-2xl p-10 text-center space-y-6 animate-in zoom-in-95 duration-200">

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center
            rounded-full bg-white/10 hover:bg-white/20 text-htg-fg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto">
          <Video className="w-10 h-10 text-blue-400" />
        </div>

        {/* Heading */}
        <div>
          <h2 className="text-2xl font-bold text-htg-fg">Przechodzimy na Zoom</h2>
          <p className="text-htg-fg-muted text-sm mt-2">
            Kliknij poniższy przycisk, aby dołączyć do spotkania na Zoom.
          </p>
        </div>

        {/* Big CTA button */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full py-5 px-8 rounded-2xl
            bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg
            transition-all active:scale-95 shadow-lg shadow-blue-600/30"
        >
          <ExternalLink className="w-6 h-6" />
          Dołącz do Zoom
        </a>

        {/* URL display for copy */}
        <div className="bg-htg-surface rounded-xl px-4 py-3 break-all">
          <p className="text-xs text-htg-fg-muted mb-1">Link do spotkania:</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:underline"
          >
            {url}
          </a>
        </div>

        <p className="text-htg-fg-muted/50 text-xs">
          Kliknij przycisk lub skopiuj link powyżej.
        </p>
      </div>
    </div>
  );
}
