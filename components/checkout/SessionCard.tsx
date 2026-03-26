'use client';

import { Check } from 'lucide-react';

interface SessionCardProps {
  id: string;
  title: string;
  description?: string;
  selected: boolean;
  onToggle: (id: string) => void;
}

export default function SessionCard({ id, title, description, selected, onToggle }: SessionCardProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-htg-sage bg-htg-sage/10 ring-1 ring-htg-sage/30'
          : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
          selected ? 'bg-htg-sage border-htg-sage' : 'border-htg-fg-muted/40'
        }`}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-htg-fg text-sm leading-snug">{title}</p>
          {description && (
            <p className="text-htg-fg-muted text-xs mt-1 line-clamp-2">{description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
