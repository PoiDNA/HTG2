'use client';

import { useState } from 'react';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';

type Settings = Record<string, unknown>;

export default function CommunitySettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState({
    community_enabled: initialSettings.community_enabled ?? true,
    community_show_in_nav: initialSettings.community_show_in_nav ?? true,
    community_title: (initialSettings.community_title as string) ?? 'Społeczność HTG',
    community_description: (initialSettings.community_description as string) ?? '',
    community_welcome: (initialSettings.community_welcome as string) ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setStatus(res.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
    setSaving(false);
    if (status === 'ok') setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider">Widoczność</h3>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-htg-fg">Społeczność aktywna</p>
            <p className="text-xs text-htg-fg-muted">Strona /społeczność jest dostępna dla użytkowników</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.community_enabled as boolean}
            onClick={() => setSettings(s => ({ ...s, community_enabled: !s.community_enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.community_enabled ? 'bg-htg-sage' : 'bg-htg-fg-muted/30'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              settings.community_enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-htg-fg">Pokaż w nawigacji</p>
            <p className="text-xs text-htg-fg-muted">Link &quot;Społeczność&quot; widoczny w menu konta</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.community_show_in_nav as boolean}
            onClick={() => setSettings(s => ({ ...s, community_show_in_nav: !s.community_show_in_nav }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.community_show_in_nav ? 'bg-htg-sage' : 'bg-htg-fg-muted/30'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              settings.community_show_in_nav ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </label>
      </div>

      {/* Text fields */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider">Treści</h3>

        <div>
          <label className="block text-xs font-semibold text-htg-fg-muted mb-1">Tytuł strony społeczności</label>
          <input
            type="text"
            value={settings.community_title}
            onChange={e => setSettings(s => ({ ...s, community_title: e.target.value }))}
            className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-htg-fg-muted mb-1">Opis (pod tytułem)</label>
          <textarea
            rows={2}
            value={settings.community_description}
            onChange={e => setSettings(s => ({ ...s, community_description: e.target.value }))}
            className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-htg-fg-muted mb-1">Wiadomość powitalna</label>
          <textarea
            rows={3}
            value={settings.community_welcome}
            onChange={e => setSettings(s => ({ ...s, community_welcome: e.target.value }))}
            className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/50 resize-none"
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </button>

        {status === 'ok' && (
          <span className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle className="w-4 h-4" /> Zapisano
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" /> Błąd zapisu
          </span>
        )}
      </div>
    </div>
  );
}
