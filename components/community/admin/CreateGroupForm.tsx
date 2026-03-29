'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Globe, Lock, Shield } from 'lucide-react';

interface CreateGroupFormProps {
  locale: string;
}

export function CreateGroupForm({ locale }: CreateGroupFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'staff_only'>('private');
  const [autoJoin, setAutoJoin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/community/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim(), visibility, auto_join: autoJoin }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Nie udało się utworzyć grupy');
      }

      setSuccess(true);
      setName('');
      setSlug('');
      setDescription('');
      router.refresh();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd');
    } finally {
      setSubmitting(false);
    }
  };

  const visibilityOptions = [
    { value: 'public' as const, label: 'Publiczna', desc: 'Widoczna dla wszystkich, dołączenie otwarte', icon: Globe },
    { value: 'private' as const, label: 'Prywatna', desc: 'Tylko zaproszeni członkowie', icon: Lock },
    { value: 'staff_only' as const, label: 'Staff', desc: 'Tylko asystentki i admin', icon: Shield },
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-htg-card border border-htg-card-border rounded-xl p-6 max-w-xl">
      <h2 className="text-lg font-serif font-semibold text-htg-fg mb-4">Utwórz nową grupę</h2>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-htg-fg mb-1">Nazwa grupy</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="np. Sesje transpersonalne"
          required
          className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
        />
      </div>

      {/* Slug */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-htg-fg mb-1">
          Slug (URL)
          <span className="text-htg-fg-muted font-normal ml-1">/spolecznosc/{slug || '...'}</span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="sesje-transpersonalne"
          required
          pattern="[a-z0-9-]+"
          className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
        />
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-htg-fg mb-1">Opis (opcjonalnie)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opis grupy..."
          rows={3}
          className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage/50 resize-none"
        />
      </div>

      {/* Visibility */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-htg-fg mb-2">Widoczność</label>
        <div className="grid grid-cols-3 gap-2">
          {visibilityOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors text-center ${
                  visibility === opt.value
                    ? 'border-htg-sage bg-htg-sage/10 text-htg-sage'
                    : 'border-htg-card-border bg-htg-surface text-htg-fg-muted hover:border-htg-sage/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-[10px] leading-tight">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-join toggle */}
      <label className="flex items-center gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={autoJoin}
          onChange={(e) => setAutoJoin(e.target.checked)}
          className="w-4 h-4 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage/50"
        />
        <div>
          <span className="text-sm font-medium text-htg-fg">Auto-join dla nowych użytkowników</span>
          <p className="text-xs text-htg-fg-muted">Nowi użytkownicy automatycznie dołączą do tej grupy po rejestracji</p>
        </div>
      </label>

      {/* Error / Success */}
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-2 bg-htg-sage/10 border border-htg-sage/30 rounded-lg text-htg-sage text-sm">
          Grupa została utworzona!
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !name.trim() || !slug.trim()}
        className="flex items-center gap-2 px-6 py-2.5 bg-htg-sage text-white rounded-lg font-medium text-sm hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Utwórz grupę
      </button>
    </form>
  );
}
