'use client';

import { useState, useEffect } from 'react';
import { Headphones, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LatestYouTubeBannerProps {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
}

export default function LatestYouTubeBanner({ youtubeId, title, thumbnailUrl }: LatestYouTubeBannerProps) {
  const [show, setShow] = useState(false);
  const t = useTranslations('YouTubeBanner');

  useEffect(() => {
    const key = `htg-yt-dismissed-${youtubeId}`;
    if (!localStorage.getItem(key)) {
      setShow(true);
    }
  }, [youtubeId]);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem(`htg-yt-dismissed-${youtubeId}`, '1');
    setShow(false);
  };

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 mb-6 flex items-center gap-4">
      <a
        href={`https://www.youtube.com/watch?v=${youtubeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 relative rounded-lg overflow-hidden w-60 h-42 group"
      >
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </a>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-htg-sage mb-0.5">{t('new_video')}</p>
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-htg-fg hover:text-htg-sage transition-colors line-clamp-1"
        >
          {title}
        </a>
      </div>

      <a
        href={`https://www.youtube.com/watch?v=${youtubeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1.5 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors whitespace-nowrap hidden sm:inline-flex sm:items-center sm:gap-1.5"
      >
        <Headphones className="w-4 h-4" />
        {t('watch')}
      </a>

      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 text-htg-fg-muted hover:text-htg-fg transition-colors"
        aria-label="Zamknij"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
