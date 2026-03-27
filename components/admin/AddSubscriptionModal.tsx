'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, X, Calendar, Package } from 'lucide-react';

interface AddSubscriptionModalProps {
  userId: string;
  userEmail: string;
  onAdded: () => void;
}

export default function AddSubscriptionModal({ userId, userEmail, onAdded }: AddSubscriptionModalProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'monthly' | 'yearly'>('monthly');
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type, startMonth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Błąd serwera');
        return;
      }
      setOpen(false);
      onAdded();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('pl', { month: 'long', year: 'numeric' });
  };

  // Calculate end month preview for yearly
  const endMonthPreview = (() => {
    if (type !== 'yearly') return null;
    const d = new Date(`${startMonth}-01T00:00:00`);
    d.setMonth(d.getMonth() + 11);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Dodaj subskrypcję"
        className="w-7 h-7 rounded-full bg-htg-sage/20 hover:bg-htg-sage/40 text-htg-sage flex items-center justify-center transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === backdropRef.current) setOpen(false); }}
        >
          <div className="w-full max-w-md bg-htg-card border border-htg-card-border rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-htg-card-border">
              <div>
                <h3 className="font-semibold text-htg-fg">Dodaj subskrypcję</h3>
                <p className="text-xs text-htg-fg-muted mt-0.5">{userEmail}</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-htg-surface hover:bg-htg-card-border transition-colors">
                <X className="w-4 h-4 text-htg-fg-muted" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-htg-fg">Typ subskrypcji</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['monthly', 'yearly'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors
                        ${type === t
                          ? 'border-htg-sage bg-htg-sage/10 text-htg-sage'
                          : 'border-htg-card-border bg-htg-surface text-htg-fg-muted hover:border-htg-sage/50'
                        }`}
                    >
                      <Package className="w-5 h-5" />
                      <span className="text-xs font-medium">{t === 'monthly' ? 'Miesięczna' : 'Roczna'}</span>
                      <span className="text-[10px] opacity-60">{t === 'monthly' ? '1 miesiąc' : '12 miesięcy'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start month */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-htg-fg flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Miesiąc zakupu
                </label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg focus:outline-none focus:border-htg-sage"
                />
                {type === 'yearly' && endMonthPreview && (
                  <p className="text-xs text-htg-fg-muted">
                    Zakres: <span className="text-htg-sage font-medium">{monthLabel(startMonth)}</span> → <span className="text-htg-sage font-medium">{monthLabel(endMonthPreview)}</span> (12 miesięcy)
                  </p>
                )}
                {type === 'monthly' && (
                  <p className="text-xs text-htg-fg-muted">
                    Dostęp do sesji z miesiąca: <span className="text-htg-sage font-medium">{monthLabel(startMonth)}</span>
                  </p>
                )}
              </div>

              {error && (
                <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 bg-htg-surface hover:bg-htg-card-border rounded-xl text-htg-fg text-sm transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-htg-sage hover:bg-htg-sage-dark text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Dodawanie…' : type === 'yearly' ? 'Dodaj 12 miesięcy' : 'Dodaj miesiąc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
