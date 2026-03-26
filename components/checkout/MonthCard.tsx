'use client';

import { Check, Music } from 'lucide-react';

interface MonthCardProps {
  id: string;
  title: string;
  sessionCount: number;
  selected: boolean;
  onToggle: (id: string) => void;
}

export default function MonthCard({ id, title, sessionCount, selected, onToggle }: MonthCardProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className={`relative p-5 rounded-xl border transition-all text-left ${
        selected
          ? 'border-htg-sage bg-htg-sage/10 ring-1 ring-htg-sage/30'
          : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
      }`}
    >
      <div className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        selected ? 'bg-htg-sage border-htg-sage' : 'border-htg-fg-muted/40'
      }`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
      <Music className="w-8 h-8 text-htg-sage/60 mb-2" />
      <p className="font-serif font-bold text-htg-fg">{title}</p>
      <p className="text-htg-fg-muted text-sm mt-1">{sessionCount} sesji</p>
      <p className="text-htg-sage font-bold text-sm mt-2">99 PLN</p>
    </button>
  );
}
