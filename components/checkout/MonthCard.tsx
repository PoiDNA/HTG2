'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Play } from 'lucide-react';

interface MonthCardProps {
  id: string;
  title: string;
  sessionCount: number;
  sessions?: { title: string }[];
  selected: boolean;
  onToggle: (id: string) => void;
  price: number;
}

export default function MonthCard({ id, title, sessionCount, sessions, selected, onToggle, price }: MonthCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all ${
        selected
          ? 'border-htg-sage bg-htg-sage/10 ring-1 ring-htg-sage/30'
          : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
      }`}
    >
      <button onClick={() => onToggle(id)} className="relative w-full p-5 text-left">
        <div className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-htg-sage border-htg-sage' : 'border-htg-fg-muted/40'
        }`}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <p className="font-serif font-bold text-htg-fg text-lg">{title}</p>
        <p className="text-htg-fg-muted text-sm mt-1">{sessionCount} sesji</p>
        <p className="text-htg-sage font-bold mt-2">{price} PLN</p>
      </button>

      {sessions && sessions.length > 0 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex items-center gap-1 text-xs text-htg-sage hover:text-htg-sage-dark px-5 pb-2 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Zwiń' : 'Zobacz sesje'}
          </button>
          {expanded && (
            <div className="px-5 pb-4 space-y-1.5">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-htg-fg-muted">
                  <Play className="w-2.5 h-2.5 text-htg-sage shrink-0" />
                  <span className="line-clamp-1">{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
