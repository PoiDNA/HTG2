'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Plus, Check, ChevronDown, Clock, X, ShoppingCart, Loader2 } from 'lucide-react';

interface SessionInfo {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
}

interface MonthInfo {
  id: string;
  title: string;
  monthLabel: string;
  sessions: SessionInfo[];
  totalSessionsInSet: number;
}

interface Prices {
  sessionPriceId: string;
  sessionAmount: number; // grosz
  monthlyPriceId: string;
  monthlyAmount: number; // grosz
}

interface Props {
  months: MonthInfo[];
  prices: Prices;
}

export default function RemainingSessionsClient({ months, prices }: Props) {
  const router = useRouter();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Record<string, boolean>>({});
  const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedKey(prev => prev === key ? null : key);
  };

  // ── Cart helpers ──────────────────────────────────────────────

  const toggleSession = (sessionId: string, monthId: string) => {
    // If whole month is in cart, don't allow individual session toggling
    if (selectedMonths[monthId]) return;
    setSelectedSessions(prev => {
      const next = { ...prev };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      return next;
    });
  };

  const toggleMonth = (month: MonthInfo) => {
    setSelectedMonths(prev => {
      const next = { ...prev };
      if (next[month.monthLabel]) {
        delete next[month.monthLabel];
      } else {
        next[month.monthLabel] = true;
        // Remove individual sessions from this month (package replaces them)
        const sessionIdsInMonth = new Set(month.sessions.map(s => s.id));
        setSelectedSessions(prevS => {
          const nextS = { ...prevS };
          for (const id of Object.keys(nextS)) {
            if (sessionIdsInMonth.has(id)) delete nextS[id];
          }
          return nextS;
        });
      }
      return next;
    });
  };

  const clearCart = () => {
    setSelectedSessions({});
    setSelectedMonths({});
  };

  // ── Cart calculations ──────────────────────────────────────────

  const sessionCount = Object.keys(selectedSessions).length;
  const monthCount = Object.keys(selectedMonths).length;
  const totalItems = sessionCount + monthCount;
  const totalPrice = (sessionCount * prices.sessionAmount + monthCount * prices.monthlyAmount) / 100;

  const cartLabel = [
    sessionCount > 0 ? `${sessionCount} ${sessionCount === 1 ? 'sesja' : sessionCount < 5 ? 'sesje' : 'sesji'}` : null,
    monthCount > 0 ? `${monthCount} ${monthCount === 1 ? 'pakiet' : monthCount < 5 ? 'pakiety' : 'pakietów'}` : null,
  ].filter(Boolean).join(', ');

  // ── Checkout ──────────────────────────────────────────────────

  async function handleCheckout() {
    setLoading(true);
    try {
      const sessionIds = Object.keys(selectedSessions);
      const monthLabels = Object.keys(selectedMonths);

      const body: Record<string, any> = {
        priceId: sessionIds.length > 0 ? prices.sessionPriceId : prices.monthlyPriceId,
        mode: 'payment',
        quantity: sessionIds.length > 0 ? sessionIds.length : monthLabels.length,
        metadata: {
          type: sessionIds.length > 0 && monthLabels.length > 0
            ? 'sessions' // mixed: send sessions, months handled by checkout route
            : sessionIds.length > 0 ? 'sessions' : 'monthly',
          sessionIds: sessionIds.length > 0 ? JSON.stringify(sessionIds) : '',
          monthLabels: monthLabels.length > 0 ? JSON.stringify(monthLabels) : '',
          return_path: '/konto',
        },
      };

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.status === 401) { router.push('/login'); return; }
      if (res.status === 400) {
        // Already owned or empty cart after filtering
        clearCart();
        router.refresh();
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <section className={`mb-10 ${totalItems > 0 ? 'pb-28' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag className="w-5 h-5 text-htg-sage" />
        <h2 className="text-lg font-serif font-semibold text-htg-fg">Pozostałe Sesje</h2>
      </div>

      <div className="space-y-3">
        {months.map(month => {
          const isMonthInCart = !!selectedMonths[month.monthLabel];
          const remainingCost = month.sessions.length * prices.sessionAmount;
          const monthCheaper = prices.monthlyAmount < remainingCost;

          return (
            <div key={month.monthLabel} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleSection(month.monthLabel)}
                  className="flex-1 flex items-center justify-between p-4 hover:bg-htg-surface/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-htg-fg">{month.title}</h3>
                    <span className="text-sm text-htg-fg-muted font-normal bg-htg-surface px-2 py-0.5 rounded-full">
                      {month.sessions.length}
                    </span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-htg-fg-muted transition-transform duration-200 ${
                    expandedKey === month.monthLabel ? 'rotate-180' : ''
                  }`} />
                </button>

                {/* Add month button */}
                {monthCheaper ? (
                  <button
                    onClick={() => toggleMonth(month)}
                    className={`shrink-0 mr-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isMonthInCart
                        ? 'bg-htg-sage text-white'
                        : 'bg-htg-sage/10 text-htg-sage hover:bg-htg-sage/20'
                    }`}
                  >
                    {isMonthInCart ? (
                      <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> W koszyku</span>
                    ) : (
                      `Dodaj miesiąc · ${prices.monthlyAmount / 100} PLN`
                    )}
                  </button>
                ) : (
                  <span className="shrink-0 mr-4 text-xs text-htg-fg-muted">
                    taniej pojedynczo
                  </span>
                )}
              </div>

              {/* Sessions list */}
              <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                expandedKey === month.monthLabel ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}>
                <div className="overflow-hidden">
                  <div className="p-4 pt-0 border-t border-htg-card-border space-y-3">
                    {month.sessions.map(session => {
                      const inCart = !!selectedSessions[session.id] || isMonthInCart;

                      return (
                        <div
                          key={session.id}
                          className="border border-htg-card-border rounded-lg bg-htg-surface/30 p-4 flex flex-col sm:flex-row sm:items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-htg-fg text-sm">{session.title}</h4>
                            {session.durationMinutes && (
                              <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mt-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{session.durationMinutes} min</span>
                              </div>
                            )}
                            {session.description && (
                              <p className="text-xs text-htg-fg-muted mt-1.5 line-clamp-2">{session.description}</p>
                            )}
                          </div>

                          <button
                            onClick={() => toggleSession(session.id, month.id)}
                            disabled={isMonthInCart}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              inCart
                                ? 'bg-htg-sage text-white'
                                : 'bg-htg-surface border border-htg-card-border text-htg-fg hover:border-htg-sage/40'
                            } disabled:opacity-60`}
                          >
                            {inCart ? (
                              <><Check className="w-3.5 h-3.5" /> Dodano</>
                            ) : (
                              <><Plus className="w-3.5 h-3.5" /> Dodaj · {prices.sessionAmount / 100} PLN</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-2xl">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-htg-sage" />
              <span className="text-htg-fg font-medium text-sm">{cartLabel}</span>
              <button onClick={clearCart} className="text-htg-fg-muted hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-htg-fg">{totalPrice} PLN</span>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Przetwarzanie...' : 'Przejdź do płatności'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
