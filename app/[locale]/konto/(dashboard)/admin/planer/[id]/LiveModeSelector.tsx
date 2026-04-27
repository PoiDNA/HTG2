'use client';

import { useState } from 'react';
import { MapPin, Monitor, MessageCircle, X } from 'lucide-react';

type LiveMode = 'requested' | 'confirmed_live' | 'confirmed_online' | null;

const OPTIONS: { value: LiveMode; label: string; icon: React.ReactNode; className: string }[] = [
  {
    value: 'requested',
    label: 'Zgłoszenie klienta',
    icon: <MessageCircle className="w-3.5 h-3.5" />,
    className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  },
  {
    value: 'confirmed_live',
    label: 'Potwierdzona na żywo (Warszawa)',
    icon: <MapPin className="w-3.5 h-3.5" />,
    className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
  },
  {
    value: 'confirmed_online',
    label: 'Potwierdzona online',
    icon: <Monitor className="w-3.5 h-3.5" />,
    className: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',
  },
];

export default function LiveModeSelector({
  bookingId,
  initialMode,
}: {
  bookingId: string;
  initialMode: LiveMode;
}) {
  const [mode, setMode] = useState<LiveMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function changeMode(newMode: LiveMode) {
    setSaving(true);
    await fetch(`/api/booking/${bookingId}/live-mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live_mode: newMode }),
    });
    setMode(newMode);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => changeMode(mode === opt.value ? null : opt.value)}
            disabled={saving}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
              mode === opt.value
                ? opt.className + ' ring-2 ring-offset-1 ring-current/30'
                : 'bg-htg-surface text-htg-fg-muted border-htg-card-border hover:bg-htg-surface/80'
            } ${saving ? 'opacity-50' : ''}`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
        {mode !== null && (
          <button
            onClick={() => changeMode(null)}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-full text-htg-fg-muted border border-htg-card-border hover:bg-htg-surface transition-colors"
            title="Usuń oznaczenie"
          >
            <X className="w-3 h-3" /> Usuń
          </button>
        )}
      </div>
      {saved && <span className="text-xs text-htg-sage">Zapisano ✓</span>}
    </div>
  );
}
