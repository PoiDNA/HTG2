'use client';

import { useState } from 'react';
import { Globe, Heart, Mail, Lock } from 'lucide-react';

interface SharingConfigProps {
  bookingId: string;
  initialMode?: string | null;
  initialEmails?: string[];
}

const MODES = [
  { value: 'private', label: 'Prywatna', icon: Lock, desc: 'Tylko Ty i prowadzący' },
  { value: 'open', label: 'Otwarta', icon: Globe, desc: 'Każdy zalogowany użytkownik HTG' },
  { value: 'favorites', label: 'Polubieni', icon: Heart, desc: 'Tylko Twoi polubieni' },
  { value: 'invited', label: 'Zaproszeni', icon: Mail, desc: 'Konkretne osoby (email)' },
];

export default function SharingConfig({ bookingId, initialMode, initialEmails = [] }: SharingConfigProps) {
  const [mode, setMode] = useState(initialMode || 'private');
  const [emails, setEmails] = useState(initialEmails.join(', '));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch('/api/sharing/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId,
        sharingMode: mode,
        invitedEmails: mode === 'invited' ? emails.split(',').map(e => e.trim()).filter(Boolean) : [],
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
      <h3 className="font-serif font-bold text-htg-fg mb-3">Udostępnianie sesji</h3>
      <p className="text-htg-fg-muted text-sm mb-4">
        Pozwól innym słuchać Twojej sesji w czasie rzeczywistym (tylko faza audio).
      </p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {MODES.map(m => {
          const Icon = m.icon;
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                active
                  ? 'border-htg-sage bg-htg-sage/10 ring-1 ring-htg-sage/30'
                  : 'border-htg-card-border hover:border-htg-sage/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${active ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
                <span className={`text-sm font-medium ${active ? 'text-htg-fg' : 'text-htg-fg-muted'}`}>
                  {m.label}
                </span>
              </div>
              <p className="text-xs text-htg-fg-muted">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {mode === 'invited' && (
        <div className="mb-4">
          <label className="text-sm text-htg-fg-muted mb-1 block">Adresy e-mail (oddzielone przecinkami)</label>
          <input
            type="text"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="jan@example.com, anna@example.com"
            className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-htg-sage text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
      >
        {saving ? 'Zapisywanie...' : saved ? 'Zapisano ✓' : 'Zapisz ustawienia'}
      </button>
    </div>
  );
}
