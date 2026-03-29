'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, RefreshCw, CheckCircle } from 'lucide-react';

export default function CreateUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('user');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function reset() {
    setEmail(''); setDisplayName(''); setRole('user'); setPassword('');
    setError(''); setSuccess('');
  }

  async function handleCreate() {
    if (!email) { setError('Email jest wymagany'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, role, password: password || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Błąd tworzenia użytkownika'); return; }
    setSuccess('Użytkownik utworzony!');
    setTimeout(() => {
      setOpen(false); reset();
      router.refresh();
    }, 1500);
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        Dodaj użytkownika
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-htg-fg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-htg-sage" />
                Nowy użytkownik
              </h2>
              <button onClick={() => setOpen(false)} className="text-htg-fg-muted hover:text-htg-fg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {success && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-500 text-sm">
                <CheckCircle className="w-4 h-4" />{success}
              </div>
            )}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-sm">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="jan@przykład.pl"
                  className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Imię i nazwisko</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Jan Kowalski"
                  className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">Rola</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm focus:outline-none">
                  <option value="user">Użytkownik</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                  <option value="publikacja">Publikacja</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider mb-1 block">
                  Hasło tymczasowe <span className="font-normal normal-case text-htg-fg-muted">(opcjonalne — auto-generowane)</span>
                </label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Pozostaw puste = auto"
                  className="w-full px-3 py-2.5 bg-htg-surface border border-htg-card-border rounded-xl text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={handleCreate} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage/90 disabled:opacity-50 transition-colors">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {saving ? 'Tworzenie...' : 'Utwórz konto'}
              </button>
              <button onClick={() => setOpen(false)}
                className="px-5 py-2.5 bg-htg-surface text-htg-fg-muted rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors">
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
