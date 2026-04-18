'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, X } from 'lucide-react';

export default function AddQuestionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) {
      setError('Pytanie musi mieć co najmniej 3 znaki');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/pytania', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? 'Błąd — spróbuj ponownie');
      return;
    }
    setTitle('');
    setBody('');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/90 transition-colors"
      >
        <PlusCircle className="w-4 h-4" />
        Zadaj pytanie
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-htg-card border border-htg-sage/30 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-htg-fg">Nowe pytanie</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-htg-fg-muted hover:text-htg-fg">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Twoje pytanie (min. 3 znaki)"
            maxLength={200}
            required
            className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:border-htg-sage"
          />
          <p className="text-xs text-htg-fg-muted/60 mt-1 text-right">{title.length}/200</p>
        </div>
        <div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Rozwinięcie (opcjonalne)"
            maxLength={5000}
            rows={3}
            className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:border-htg-sage resize-none"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Wysyłanie…' : 'Wyślij pytanie'}
          </button>
        </div>
      </div>
    </form>
  );
}
