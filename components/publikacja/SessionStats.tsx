'use client';

import { Music, Headphones, CheckCircle, FileAudio, Disc3 } from 'lucide-react';
import type { PublicationStats } from '@/lib/publication/types';

export function SessionStats({
  stats,
  labels,
}: {
  stats: PublicationStats;
  labels: {
    total: string;
    raw: string;
    editing: string;
    edited: string;
    mastering: string;
    published: string;
  };
}) {
  const items = [
    { key: 'total', value: stats.total, label: labels.total, icon: Music, color: 'text-htg-fg' },
    { key: 'raw', value: stats.raw, label: labels.raw, icon: FileAudio, color: 'text-gray-500' },
    { key: 'editing', value: stats.editing, label: labels.editing, icon: Headphones, color: 'text-blue-500' },
    { key: 'edited', value: stats.edited, label: labels.edited, icon: Disc3, color: 'text-amber-500' },
    { key: 'mastering', value: stats.mastering, label: labels.mastering, icon: Disc3, color: 'text-purple-500' },
    { key: 'published', value: stats.published, label: labels.published, icon: CheckCircle, color: 'text-green-500' },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map(({ key, value, label, icon: Icon, color }) => (
        <div key={key} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-xs text-htg-fg-muted">{label}</span>
          </div>
          <p className="text-2xl font-serif font-bold text-htg-fg">{value}</p>
        </div>
      ))}
    </div>
  );
}
