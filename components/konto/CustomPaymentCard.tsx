'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { CreditCard, ChevronDown } from 'lucide-react';

const SESSION_TYPE_LABELS: Record<string, string> = {
  natalia_solo: 'Sesja 1:1 z Natalią',
  natalia_agata: 'Sesja z Natalią i Agatą',
  natalia_justyna: 'Sesja z Natalią i Justyną',
};

interface Props {
  sessionType: string;
  slotId?: string;
}

export function CustomPaymentCard({ sessionType, slotId }: Props) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const amountNum = parseInt(amount) || 0;
  const sessionLabel = SESSION_TYPE_LABELS[sessionType] || 'Sesja indywidualna';

  async function handlePay() {
    if (amountNum < 1) { setError('Wpisz kwotę min. 1 PLN'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountOverride: amountNum * 100, // PLN → grosz
          mode: 'payment',
          locale,
          metadata: {
            payment_mode: 'custom',
            session_type: sessionType,
            slot_id: slotId || '',
          },
        }),
      });
      const data = await res.json();
      if (res.status === 401) { router.push(`/${locale}/login`); return; }
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Błąd płatności');
    } catch {
      setError('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-htg-card-border bg-htg-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
      >
        <span className="flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Wpłać dopłatę / ratę
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-htg-card-border space-y-3 pt-3">
          <p className="text-xs text-htg-fg-muted">
            Wpłać dowolną kwotę na poczet sesji: <span className="text-htg-fg font-medium">{sessionLabel}</span>
          </p>

          <div>
            <label className="text-xs text-htg-fg-muted block mb-1">Kwota wpłaty (PLN)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(''); }}
                placeholder="np. 400"
                className="flex-1 px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-base font-bold focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              />
              <button
                onClick={handlePay}
                disabled={loading || amountNum < 1}
                className="px-5 py-2.5 bg-htg-sage text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading ? '...' : `Wpłać ${amountNum > 0 ? amountNum + ' PLN' : ''}`}
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
