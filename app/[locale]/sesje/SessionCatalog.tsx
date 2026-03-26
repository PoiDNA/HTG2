'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Play, ShoppingCart, Check, ChevronDown, Calendar, Sparkles } from 'lucide-react';

interface SessionInfo {
  id: string;
  title: string;
  description: string | null;
}

interface MonthSetInfo {
  id: string;
  title: string;
  month_label: string;
  sessions: SessionInfo[];
}

interface Prices {
  sessionPriceId: string;
  sessionAmount: number;
  monthlyPriceId: string;
  monthlyAmount: number;
}

interface SessionCatalogProps {
  monthSets: MonthSetInfo[];
  prices: Prices;
}

export default function SessionCatalog({ monthSets, prices }: SessionCatalogProps) {
  const [tab, setTab] = useState<'sessions' | 'monthly'>('sessions');
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const spotlightSet = monthSets.find(ms => ms.id === spotlightId);

  // Scroll to spotlight when opened
  useEffect(() => {
    if (spotlightId && spotlightRef.current) {
      setTimeout(() => {
        spotlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [spotlightId]);

  // Close spotlight on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSpotlightId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleSession = useCallback((id: string) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleMonth = useCallback((id: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllInSet = useCallback((sessions: SessionInfo[]) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      const all = sessions.every(s => next.has(s.id));
      sessions.forEach(s => all ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  }, []);

  async function handleCheckout() {
    setLoading(true);
    try {
      const body = tab === 'sessions'
        ? {
            priceId: prices.sessionPriceId,
            mode: 'payment',
            quantity: selectedSessions.size,
            metadata: { type: 'sessions', sessionIds: JSON.stringify(Array.from(selectedSessions)) },
          }
        : {
            priceId: prices.monthlyPriceId,
            mode: 'payment',
            quantity: selectedMonths.size,
            metadata: {
              type: 'monthly',
              monthLabels: JSON.stringify(
                Array.from(selectedMonths).map(id => monthSets.find(m => m.id === id)?.month_label).filter(Boolean)
              ),
            },
          };

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { router.push('/login'); return; }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const cartCount = tab === 'sessions' ? selectedSessions.size : selectedMonths.size;
  const totalPrice = tab === 'sessions'
    ? selectedSessions.size * prices.sessionAmount
    : selectedMonths.size * prices.monthlyAmount;

  return (
    <div className="pb-28">
      {/* Tab switcher */}
      <div className="flex gap-3 mb-10">
        {[
          { key: 'sessions' as const, label: 'Sesje pojedyncze', desc: 'Wybierz konkretne sesje', price: `${prices.sessionAmount} PLN / sesja` },
          { key: 'monthly' as const, label: 'Pakiety miesięczne', desc: 'Cały miesiąc w niższej cenie', price: `${prices.monthlyAmount} PLN / miesiąc` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSpotlightId(null); }}
            className={`flex-1 p-5 rounded-xl border-2 text-left transition-all ${
              tab === t.key ? 'border-htg-sage bg-htg-sage/10' : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
            }`}
          >
            <p className="font-serif font-bold text-lg text-htg-fg">{t.label}</p>
            <p className="text-htg-fg-muted text-sm mt-1">{t.desc}</p>
            <p className="text-htg-sage font-bold mt-2">{t.price}</p>
          </button>
        ))}
      </div>

      {/* Month grid — compact cards */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
        {monthSets.map(ms => {
          const isSpotlight = spotlightId === ms.id;
          const isSelected = tab === 'monthly' ? selectedMonths.has(ms.id) : ms.sessions.some(s => selectedSessions.has(s.id));
          const selectedCount = tab === 'sessions' ? ms.sessions.filter(s => selectedSessions.has(s.id)).length : 0;

          return (
            <button
              key={ms.id}
              onClick={() => setSpotlightId(isSpotlight ? null : ms.id)}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                isSpotlight
                  ? 'border-htg-sage bg-htg-sage/20 ring-2 ring-htg-sage/40 scale-105 z-10'
                  : isSelected
                    ? 'border-htg-sage/60 bg-htg-sage/10'
                    : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40 hover:scale-[1.02]'
              }`}
            >
              <p className="font-serif font-bold text-sm text-htg-fg leading-tight">
                {ms.title.replace('Sesje ', '')}
              </p>
              <p className="text-htg-fg-muted text-xs mt-1">{ms.sessions.length} sesji</p>
              {isSelected && tab === 'sessions' && selectedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-htg-sage text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {selectedCount}
                </span>
              )}
              {isSelected && tab === 'monthly' && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-htg-sage rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Spotlight — expanded detail */}
      {spotlightSet && (
        <div
          ref={spotlightRef}
          className="relative bg-htg-card border-2 border-htg-sage/30 rounded-2xl p-6 md:p-8 mb-8 animate-in fade-in slide-in-from-top-4 duration-300"
        >
          {/* Close button */}
          <button
            onClick={() => setSpotlightId(null)}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-htg-sage/20 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-htg-sage" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-2xl text-htg-fg">{spotlightSet.title}</h2>
              <p className="text-htg-fg-muted mt-1">
                {spotlightSet.sessions.length} sesji
                {tab === 'monthly' && <span className="text-htg-sage font-bold ml-2">{prices.monthlyAmount} PLN</span>}
                {tab === 'sessions' && <span className="text-htg-fg-muted ml-2">· {prices.sessionAmount} PLN / sesja</span>}
              </p>
            </div>
          </div>

          {/* Sessions list */}
          <div className="space-y-2 mb-6">
            {spotlightSet.sessions.map((s, i) => {
              const isSessionSelected = selectedSessions.has(s.id);
              const isExpanded = expandedSession === s.id;

              return (
                <div
                  key={s.id}
                  className={`rounded-xl border transition-all ${
                    isExpanded ? 'border-htg-sage/40 bg-htg-sage/5' : 'border-htg-card-border hover:border-htg-sage/30'
                  }`}
                >
                  <div className="flex items-center gap-3 p-4">
                    {/* Checkbox (sessions tab) */}
                    {tab === 'sessions' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSession(s.id); }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSessionSelected ? 'bg-htg-sage border-htg-sage' : 'border-htg-fg-muted/40 hover:border-htg-sage'
                        }`}
                      >
                        {isSessionSelected && <Check className="w-3 h-3 text-white" />}
                      </button>
                    )}

                    {/* Session number */}
                    <span className="text-htg-sage font-mono text-xs font-bold shrink-0 w-6">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    {/* Title */}
                    <p className="font-medium text-htg-fg text-sm flex-1 leading-snug">{s.title}</p>

                    {/* Expand button */}
                    {s.description && (
                      <button
                        onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                        className={`p-1 rounded transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <ChevronDown className="w-4 h-4 text-htg-fg-muted" />
                      </button>
                    )}
                  </div>

                  {/* Expanded description */}
                  {isExpanded && s.description && (
                    <div className="px-4 pb-4 pl-16">
                      <p className="text-htg-fg-muted text-sm leading-relaxed whitespace-pre-line">
                        {s.description.slice(0, 500)}
                        {s.description.length > 500 && '...'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {tab === 'sessions' && (
              <>
                <button
                  onClick={() => selectAllInSet(spotlightSet.sessions)}
                  className="px-5 py-3 rounded-xl border border-htg-sage text-htg-sage font-medium text-sm hover:bg-htg-sage/10 transition-colors"
                >
                  {spotlightSet.sessions.every(s => selectedSessions.has(s.id))
                    ? 'Odznacz wszystkie'
                    : `Zaznacz wszystkie (${spotlightSet.sessions.length} × ${prices.sessionAmount} PLN)`
                  }
                </button>
                {selectedSessions.size > 0 && (
                  <span className="text-htg-fg-muted text-sm">
                    Wybrano: {spotlightSet.sessions.filter(s => selectedSessions.has(s.id)).length} z {spotlightSet.sessions.length}
                  </span>
                )}
              </>
            )}
            {tab === 'monthly' && (
              <button
                onClick={() => toggleMonth(spotlightSet.id)}
                className={`px-6 py-3 rounded-xl font-medium text-sm transition-all ${
                  selectedMonths.has(spotlightSet.id)
                    ? 'bg-htg-sage text-white'
                    : 'bg-htg-sage/10 border border-htg-sage text-htg-sage hover:bg-htg-sage hover:text-white'
                }`}
              >
                {selectedMonths.has(spotlightSet.id) ? (
                  <span className="flex items-center gap-2"><Check className="w-4 h-4" /> W koszyku</span>
                ) : (
                  `Dodaj pakiet — ${prices.monthlyAmount} PLN`
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dimmed overlay hint when no spotlight */}
      {!spotlightId && (
        <div className="text-center py-8">
          <Sparkles className="w-8 h-8 text-htg-fg-muted/40 mx-auto mb-3" />
          <p className="text-htg-fg-muted text-sm">
            Kliknij miesiąc aby zobaczyć szczegóły sesji
          </p>
        </div>
      )}

      {/* Floating cart */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-2xl">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-htg-sage" />
              <span className="text-htg-fg font-medium">
                {cartCount} {tab === 'sessions' ? 'sesji' : 'pakietów'}
              </span>
              <button
                onClick={() => tab === 'sessions' ? setSelectedSessions(new Set()) : setSelectedMonths(new Set())}
                className="text-htg-fg-muted hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-htg-fg">{totalPrice} PLN</span>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="bg-htg-sage text-white px-6 py-3 rounded-xl font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
              >
                {loading ? 'Przetwarzanie...' : 'Przejdź do płatności'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
