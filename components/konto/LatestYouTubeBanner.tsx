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

  const ytUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        {/* Thumbnail — always visible */}
        <a
          href={ytUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full sm:w-64 md:w-80 aspect-video sm:shrink-0 relative group overflow-hidden"
        >
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </a>

        {/* Description + watch button — hidden when not enough space */}
        <div className="hidden md:flex flex-col flex-1 min-w-0 p-4 justify-center gap-1.5">
          <p className="text-xs font-medium text-htg-sage">{t('new_video')}</p>
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-htg-fg hover:text-htg-sage transition-colors line-clamp-2"
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

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 self-start p-1 m-1 text-htg-fg-muted hover:text-htg-fg transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
