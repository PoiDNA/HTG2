'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

interface LatestYouTubeBannerProps {
  youtubeId: string;
  thumbnailUrl: string;
}

export default function LatestYouTubeBanner({ youtubeId, thumbnailUrl }: LatestYouTubeBannerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissedKey = `htg-yt-dismissed-${youtubeId}`;
    const seenKey = `htg-yt-seen-${youtubeId}`;

    if (localStorage.getItem(dismissedKey)) return;

    const seenAt = localStorage.getItem(seenKey);
    if (seenAt) {
      if (Date.now() - Number(seenAt) < THREE_DAYS_MS) {
        setShow(true);
      }
    } else {
      localStorage.setItem(seenKey, String(Date.now()));
      setShow(true);
    }
  }, [youtubeId]);

  if (!show) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    localStorage.setItem(`htg-yt-dismissed-${youtubeId}`, '1');
    setShow(false);
  };

  return (
    <a
      href={`https://www.youtube.com/watch?v=${youtubeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden group w-full h-full min-h-[160px] relative"
    >
      <img
        src={thumbnailUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        aria-label="Zamknij"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </a>
  );
}
