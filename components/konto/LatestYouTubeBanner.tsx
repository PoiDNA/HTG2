'use client';

import { useState, useEffect } from 'react';
import { Headphones, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LatestYouTubeBannerProps {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
}

export default function LatestYouTubeBanner({ youtubeId, title }: LatestYouTubeBannerProps) {
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

  const ytUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  return (
    <div className="relative bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        {/* YouTube embed player — fixed 16:9 ratio, standard YT size */}
        <div className="shrink-0 w-full sm:w-72 md:w-80 aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
            title={title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Description + watch button — hidden when not enough space */}
        <div className="hidden md:flex flex-col flex-1 min-w-0 p-4 pr-8 justify-center gap-1.5">
          <p className="text-xs font-medium text-htg-sage">{t('new_video')}</p>
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-htg-fg hover:text-htg-sage transition-colors line-clamp-3"
          >
            {title}
          </a>
          <div className="mt-1">
            <a
              href={ytUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors whitespace-nowrap"
            >
              <Headphones className="w-4 h-4" />
              {t('watch')}
            </a>
          </div>
        </div>
      </div>

      {/* Dismiss button — positioned absolutely so it doesn't affect layout */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-htg-fg-muted hover:text-htg-fg transition-colors bg-htg-card/80 rounded-full"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
