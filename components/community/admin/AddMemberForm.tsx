'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Loader2, Check } from 'lucide-react';

interface AddMemberFormProps {
  groupId: string;
  groupSlug: string;
}

export function AddMemberForm({ groupId, groupSlug }: AddMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'moderator'>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/community/groups/${groupSlug}/add-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Nie udało się dodać członka');
      }

      const data = await res.json();
      setSuccess(`Dodano: ${data.display_name || email}`);
      setEmail('');
      router.refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
        <div className="relative flex-grow min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email użytkownika..."
            required
            className="w-full pl-10 pr-4 py-2 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
          />
        </div>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'member' | 'moderator')}
          className="px-3 py-2 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg"
        >
          <option value="member">Członek</option>
          <option value="moderator">Moderator</option>
        </select>

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="flex items-center gap-1 px-4 py-2 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Dodaj
        </button>
      </form>

      {error && (
        <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-2 px-3 py-2 bg-htg-sage/10 border border-htg-sage/30 rounded-lg text-htg-sage text-sm flex items-center gap-1">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}
    </div>
  );
}
