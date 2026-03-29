'use client';

import { ExternalLink } from 'lucide-react';
import type { LinkPreviewAttachment } from '@/lib/community/types';

interface LinkPreviewProps {
  attachment: LinkPreviewAttachment;
}

/**
 * Renders an Open Graph link preview card.
 */
export function LinkPreview({ attachment }: LinkPreviewProps) {
  const { url, metadata } = attachment;
  const { title, description, og_image } = metadata ?? {};

  if (!title && !description) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-htg-card-border rounded-lg overflow-hidden hover:border-htg-sage/30 transition-colors group mx-4 mb-3"
    >
      {og_image && (
        <div className="aspect-[2/1] bg-htg-surface overflow-hidden">
          <img
            src={og_image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        {title && (
          <h4 className="font-medium text-sm text-htg-fg line-clamp-2 group-hover:text-htg-sage transition-colors">
            {title}
          </h4>
        )}
        {description && (
          <p className="text-xs text-htg-fg-muted mt-1 line-clamp-2">
            {description}
          </p>
        )}
        <div className="flex items-center gap-1 mt-2 text-xs text-htg-fg-muted">
          <ExternalLink className="w-3 h-3" />
          <span className="truncate">{new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  );
}
