'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, X, Plus, Trash2, Loader2, AlertCircle, Users } from 'lucide-react';

interface InitiateCallModalProps {
  locale: string;
}

export default function InitiateCallModal({ locale }: InitiateCallModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addEmail = useCallback(() => {
    const val = emailInput.trim().toLowerCase();
    if (!val || !val.includes('@')) { setError('Podaj poprawny email'); return; }
    if (emails.includes(val)) { setError('Ten email jest już na liście'); return; }
    setEmails(prev => [...prev, val]);
    setEmailInput('');
    setError('');
  }, [emailInput, emails]);

  const removeEmail = (email: string) => setEmails(prev => prev.filter(e => e !== email));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addEmail(); }
  };

  const handleStart = useCallback(async () => {
    if (!emails.length) { setError('Dodaj co najmniej jeden email'); return; }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/quick-call/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? 'Błąd tworzenia połączenia'); return; }

      if (data.notFound?.length) {
        setError(`Nie znaleziono: ${data.notFound.join(', ')} — połączenie i tak zostanie utworzone`);
      }

      setOpen(false);
      router.push(`/${locale}/polaczenie/${data.callId}`);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  }, [emails, locale, router]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors shadow-sm"
      >
        <Phone className="w-4 h-4" />
        Inicjuj połączenie
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-htg-card border border-htg-card-border rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-htg-card-border">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-htg-sage" />
                <h2 className="font-serif font-bold text-htg-fg">Nowe połączenie</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-htg-fg-muted hover:text-htg-fg transition-colors p-1 rounded-lg hover:bg-htg-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-htg-fg-muted">
                Zaproś użytkowników HTG podając ich adres email. Dołączą od razu bez potwierdzenia.
              </p>

              {/* Email input */}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                  placeholder="email@example.com"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-htg-surface border border-htg-card-border text-htg-fg text-sm placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
                />
                <button
                  onClick={addEmail}
                  className="px-3 py-2.5 rounded-xl bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage transition-colors"
                  title="Dodaj"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Email list */}
              {emails.length > 0 && (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {emails.map(email => (
                    <li
                      key={email}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-htg-surface border border-htg-card-border"
                    >
                      <span className="text-sm text-htg-fg truncate">{email}</span>
                      <button
                        onClick={() => removeEmail(email)}
                        className="text-htg-fg-muted hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {emails.length === 0 && (
                <p className="text-xs text-htg-fg-muted/50 text-center py-2">
                  Brak zaproszonych osób
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-htg-card-border flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleStart}
                disabled={loading || !emails.length}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-htg-sage text-white text-sm font-medium
                  hover:bg-htg-sage/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Łączę...</>
                ) : (
                  <><Phone className="w-4 h-4" /> Zadzwoń ({emails.length})</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
