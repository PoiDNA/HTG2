'use client';

import { useState } from 'react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const SESSION_TYPE_OPTIONS = [
  { value: 'natalia_asysta' as SessionType, label: `${SESSION_CONFIG.natalia_asysta.label} (nieprzypisana)` },
  { value: 'natalia_agata' as SessionType, label: SESSION_CONFIG.natalia_agata.label },
  { value: 'natalia_justyna' as SessionType, label: SESSION_CONFIG.natalia_justyna.label },
  { value: 'natalia_solo' as SessionType, label: SESSION_CONFIG.natalia_solo.label },
];

export default function SessionTypeSelector({
  bookingId,
  initialType,
}: {
  bookingId: string;
  initialType: string;
}) {
  const [sessionType, setSessionType] = useState(initialType);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function changeType(newType: string) {
    setSaving(true);
    await fetch(`/api/booking/${bookingId}/payment-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_type: newType }),
    });
    setSessionType(newType);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {SESSION_TYPE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => changeType(opt.value)}
          disabled={saving}
          className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
            sessionType === opt.value
              ? 'bg-htg-indigo/20 text-htg-indigo border-htg-indigo/40 ring-2 ring-htg-indigo/20'
              : 'bg-htg-surface text-htg-fg-muted border-htg-card-border hover:bg-htg-surface/80'
          } ${saving ? 'opacity-50' : ''}`}
        >
          {opt.label}
        </button>
      ))}
      {saved && <span className="text-xs text-htg-sage">Zapisano ✓</span>}
    </div>
  );
}
