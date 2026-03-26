'use client';

import { Download, FileAudio } from 'lucide-react';
import type { TrackInfo } from '@/lib/publication/types';

interface TrackListProps {
  tracks: TrackInfo[];
  publicationId: string;
  type: 'source' | 'edited' | 'mastered' | 'auto';
  labels: {
    download: string;
    no_tracks: string;
  };
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackList({ tracks, publicationId, type, labels }: TrackListProps) {
  if (!tracks || tracks.length === 0) {
    return (
      <p className="text-sm text-htg-fg-muted py-4">{labels.no_tracks}</p>
    );
  }

  return (
    <div className="space-y-2">
      {tracks.map((track, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 px-4 py-3 bg-htg-surface rounded-lg"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileAudio className="w-5 h-5 text-htg-fg-muted shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-htg-fg truncate">{track.name}</p>
              {track.size && (
                <p className="text-xs text-htg-fg-muted">{formatFileSize(track.size)}</p>
              )}
            </div>
          </div>
          <a
            href={`/api/publikacja/download/${publicationId}/${type}/${encodeURIComponent(track.name)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-htg-sage hover:text-htg-sage/80 bg-htg-card border border-htg-card-border rounded-lg transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {labels.download}
          </a>
        </div>
      ))}
    </div>
  );
}
