'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, X, Check, Loader2, AlertTriangle } from 'lucide-react';

interface FeatureEntitlement {
  id: string;
  feature_key: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
}

interface GrantFragmentAccessButtonProps {
  userId: string;
  userEmail: string;
  /** Existing active fragments entitlement (if any) */
  existing?: FeatureEntitlement | null;
  /** Called after grant/revoke succeeds. Defaults to router.refresh(). */
  onChanged?: () => void;
}

/**
 * Admin component — grants or revokes Fragments feature access for a user.
 * Rendered on /admin/uzytkownicy/[id].
 */
export default function GrantFragmentAccessButton({
  userId,
  userEmail,
  existing,
  onChanged,
}: GrantFragmentAccessButtonProps) {
  const router = useRouter();
  const handleChanged = onChanged ?? (() => router.refresh());
  const [open, setOpen] = useState(false);
  // Default valid_until: 1 year from today
  const defaultUntil = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [validUntil, setValidUntil] = useState(defaultUntil);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = existing?.is_active && existing.valid_until > new Date().toISOString();
  const validUntilLabel = existing
    ? new Date(existing.valid_until).toLocaleDateString('pl', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/entitlements/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, featureKey: 'fragments', validUntil }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Błąd serwera');
        return;
      }
      setOpen(false);
      handleChanged();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!existing?.id) return;
    if (!confirm(`Cofnąć dostęp do Momentów dla ${userEmail}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/entitlements/feature?id=${existing.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Błąd serwera');
        return;
      }
      handleChanged();
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Status pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
          isActive
            ? 'bg-htg-sage/15 text-htg-sage border border-htg-sage/30'
            : 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
        }`}>
          <Bookmark className="w-3.5 h-3.5" />
          {isActive ? 'Dostęp aktywny' : 'Brak dostępu'}
        </div>

        {isActive && validUntilLabel && (
          <span className="text-xs text-htg-fg-muted">do {validUntilLabel}</span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => { setOpen(true); setError(null); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-htg-sage/20 hover:bg-htg-sage/30 text-htg-sage rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Bookmark className="w-3.5 h-3.5" />
          {isActive ? 'Przedłuż dostęp' : 'Nadaj dostęp'}
        </button>

        {isActive && (
          <button
            onClick={handleRevoke}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Cofnij dostęp
          </button>
        )}
      </div>

      {/* Grant modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm bg-htg-card border border-htg-card-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-htg-card-border">
              <div>
                <h3 className="font-semibold text-htg-fg text-sm flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-htg-sage" />
                  Dostęp do Momentów sesji
                </h3>
                <p className="text-xs text-htg-fg-muted mt-0.5">{userEmail}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-htg-surface hover:bg-htg-card-border transition-colors"
              >
                <X className="w-3.5 h-3.5 text-htg-fg-muted" />
              </button>
            </div>

            <form onSubmit={handleGrant} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-htg-fg">Dostęp ważny do</label>
                <input
                  type="date"
                  value={validUntil}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setValidUntil(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg focus:outline-none focus:border-htg-sage"
                />
                <p className="text-xs text-htg-fg-muted">
                  User uzyska dostęp do zapisu i odtwarzania Momentów sesji oraz trybu Radio.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-2 bg-htg-surface hover:bg-htg-card-border rounded-xl text-xs text-htg-fg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-3 py-2 bg-htg-sage hover:bg-htg-sage/90 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Check className="w-3.5 h-3.5" />}
                  {isActive ? 'Przedłuż' : 'Nadaj dostęp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
