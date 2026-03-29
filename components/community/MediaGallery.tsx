'use client';

import type { ImageAttachment } from '@/lib/community/types';

interface MediaGalleryProps {
  attachments: ImageAttachment[];
}

/**
 * Displays 1-4 images in a responsive grid.
 * 1 image: full width
 * 2 images: side by side
 * 3 images: 2 top + 1 bottom
 * 4 images: 2x2 grid
 */
export function MediaGallery({ attachments }: MediaGalleryProps) {
  const count = attachments.length;
  if (count === 0) return null;

  const gridClass =
    count === 1 ? 'grid-cols-1' :
    count === 2 ? 'grid-cols-2' :
    count === 3 ? 'grid-cols-2' :
    'grid-cols-2';

  return (
    <div className={`grid ${gridClass} gap-0.5 mx-4 mb-3 rounded-lg overflow-hidden`}>
      {attachments.map((att, i) => (
        <div
          key={i}
          className={`relative bg-htg-surface ${
            count === 1 ? 'aspect-video' :
            count === 3 && i === 2 ? 'col-span-2 aspect-video' :
            'aspect-square'
          }`}
        >
          <img
            src={`/api/community/media?path=${att.url}`}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
