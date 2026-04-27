'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

type CompletionStatus = 'no_show' | 'cancelled_by_htg' | null;

const OPTIONS: { value: CompletionStatus; label: string; description: string; color: string }[] = [
  {
    value: null,
    label: 'Sesja odbyła się',
    description: 'Brak adnotacji — normalny przebieg',
    color: 'border-htg-sage/40 bg-htg-sage/5 text-htg-sage',
  },
  {
    value: 'no_show',
    label: 'Klient nie stawił się',
    description: 'Klient nie pojawił się na umówioną sesję',
    color: 'border-amber-500/40 bg-amber-500/5 text-amber-400',
  },
  {
    value: 'cancelled_by_htg',
    label: 'Odwołana przez HTG',
    description: 'Sesja odwołana ze strony HTG',
    color: 'border-red-500/40 bg-red-500/5 text-red-400',
  },
];

export default function SessionCompletionEditor({
  bookingId,
  initialStatus,
  initialNotes,
}: {
  bookingId: string;
  initialStatus: CompletionStatus;
  initialNotes: string | null;
}) {
  const [status, setStatus] = useState<CompletionStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isDirty = status !== initialStatus || notes !== (initialNotes ?? '');

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/admin/booking/set-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, completionStatus: status, completionNotes: notes }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Błąd zapisu');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const activeOption = OPTIONS.find(o => o.value === status) ?? OPTIONS[0];

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
      <h2 className="text-base font-serif font-bold text-htg-fg flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        Status realizacji sesji
      </h2>

      {/* Radio options */}
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => { setStatus(opt.value); setSaved(false); }}
            className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg border transition-all ${
              status === opt.value
                ? `${opt.color} border-opacity-100`
                : 'border-htg-card-border hover:border-htg-fg-muted/40 text-htg-fg-muted'
            }`}
          >
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              status === opt.value ? 'border-current' : 'border-htg-fg-muted/40'
            }`}>
              {status === opt.value && (
                <span className="w-2 h-2 rounded-full bg-current" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">{opt.label}</span>
              <span className="block text-xs opacity-70 mt-0.5">{opt.description}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Notes — only when non-null status */}
      {status !== null && (
        <div>
          <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
            Notatka (opcjonalnie)
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setSaved(false); }}
            rows={2}
            placeholder="np. klient poinformował z 10-minutowym wyprzedzeniem…"
            className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg
                       placeholder:text-htg-fg-muted/50 resize-none focus:outline-none focus:border-htg-sage/50"
          />
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-2 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-htg-sage/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Zapisz
        </button>

        {saved && (
          <span className="flex items-center gap-1 text-sm text-htg-sage">
            <CheckCircle className="w-4 h-4" /> Zapisano
          </span>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
