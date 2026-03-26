'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

interface VideoThumbnailProps {
  youtubeId: string;
  title: string;
}

/**
 * Shows YouTube thumbnail with play button overlay.
 * On click → loads the iframe (no YouTube branding visible before play).
 */
export default function VideoThumbnail({ youtubeId, title }: VideoThumbnailProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="relative w-full aspect-video group cursor-pointer overflow-hidden"
      aria-label={`Odtwórz: ${title}`}
    >
      <img
        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-htg-sage/90 group-hover:bg-htg-sage flex items-center justify-center transition-colors shadow-lg">
          <Play className="w-7 h-7 text-white ml-1" fill="white" />
        </div>
      </div>
    </button>
  );
}
