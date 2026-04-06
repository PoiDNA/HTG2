'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Preferences {
  email_digest: 'off' | 'daily' | 'weekly';
  push_enabled: boolean;
  push_comments: boolean;
  push_mentions: boolean;
  push_reactions: boolean;
}

const defaults: Preferences = {
  email_digest: 'off',
  push_enabled: false,
  push_comments: false,
  push_mentions: false,
  push_reactions: false,
};

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/community/preferences')
      .then(r => r.json())
      .then(data => {
        setPrefs({ ...defaults, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updatePref = async (key: keyof Preferences, value: unknown) => {
    const prev = prefs[key];
    setPrefs(p => ({ ...p, [key]: value }));
    setSaving(true);

    try {
      const res = await fetch('/api/community/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });

      if (!res.ok) throw new Error();
      toast.success('Zapisano');
    } catch {
      setPrefs(p => ({ ...p, [key]: prev }));
      toast.error('Nie udało się zapisać');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-htg-fg-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Email digest */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-htg-fg mb-2">
          <Mail className="w-4 h-4 text-htg-fg-muted" />
          Podsumowanie email
        </label>
        <select
          value={prefs.email_digest}
          onChange={(e) => updatePref('email_digest', e.target.value)}
          className="px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg"
        >
          <option value="off">Wyłączone</option>
          <option value="daily">Codziennie</option>
          <option value="weekly">Co tydzień</option>
        </select>
      </div>

      {/* Push toggles */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-htg-fg mb-2">
          <Bell className="w-4 h-4 text-htg-fg-muted" />
          Powiadomienia push
        </label>
        <div className="space-y-2">
          <Toggle
            label="Włączone"
            checked={prefs.push_enabled}
            onChange={(v) => updatePref('push_enabled', v)}
          />
          {prefs.push_enabled && (
            <>
              <Toggle
                label="Nowe komentarze"
                checked={prefs.push_comments}
                onChange={(v) => updatePref('push_comments', v)}
              />
              <Toggle
                label="@wzmianki"
                checked={prefs.push_mentions}
                onChange={(v) => updatePref('push_mentions', v)}
              />
              <Toggle
                label="Reakcje"
                checked={prefs.push_reactions}
                onChange={(v) => updatePref('push_reactions', v)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-2 px-3 bg-htg-surface rounded-lg cursor-pointer">
      <span className="text-sm text-htg-fg">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-htg-sage' : 'bg-htg-card-border'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}
