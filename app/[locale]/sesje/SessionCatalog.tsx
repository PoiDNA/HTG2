'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SessionCard from '@/components/checkout/SessionCard';
import MonthCard from '@/components/checkout/MonthCard';
import FloatingCart from '@/components/checkout/FloatingCart';

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
  initialTab?: 'sessions' | 'monthly';
}

export default function SessionCatalog({ monthSets, prices, initialTab = 'sessions' }: SessionCatalogProps) {
  const [tab, setTab] = useState<'sessions' | 'monthly'>(initialTab);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const toggleSession = useCallback((id: string) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMonth = useCallback((id: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllInMonth = useCallback((sessions: SessionInfo[]) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      const allSelected = sessions.every(s => next.has(s.id));
      if (allSelected) {
        sessions.forEach(s => next.delete(s.id));
      } else {
        sessions.forEach(s => next.add(s.id));
      }
      return next;
    });
  }, []);

  async function handleCheckout() {
    setLoading(true);
    try {
      let body: any;

      if (tab === 'sessions') {
        const sessionIds = Array.from(selectedSessions);
        body = {
          priceId: prices.sessionPriceId,
          mode: 'payment',
          quantity: sessionIds.length,
          metadata: { type: 'sessions', sessionIds: JSON.stringify(sessionIds) },
        };
      } else {
        const monthIds = Array.from(selectedMonths);
        const monthLabels = monthIds.map(id => monthSets.find(m => m.id === id)?.month_label).filter(Boolean);
        body = {
          priceId: prices.monthlyPriceId,
          mode: 'payment',
          quantity: monthIds.length,
          metadata: { type: 'monthly', monthLabels: JSON.stringify(monthLabels) },
        };
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL:', data);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  }

  const sessionCount = selectedSessions.size;
  const monthCount = selectedMonths.size;
  const totalPrice = tab === 'sessions'
    ? sessionCount * prices.sessionAmount
    : monthCount * prices.monthlyAmount;
  const cartCount = tab === 'sessions' ? sessionCount : monthCount;
  const cartLabel = tab === 'sessions'
    ? `ses${sessionCount === 1 ? 'ja' : sessionCount < 5 ? 'je' : 'ji'} wybran${sessionCount === 1 ? 'a' : sessionCount < 5 ? 'e' : 'ych'}`
    : `pakiet${monthCount === 1 ? '' : monthCount < 5 ? 'y' : 'ów'} wybran${monthCount === 1 ? 'y' : monthCount < 5 ? 'e' : 'ych'}`;

  return (
    <div className="pb-24">
      {/* Tab switcher */}
      <div className="flex flex-col sm:flex-row gap-3 mb-10">
        <button
          onClick={() => setTab('sessions')}
          className={`flex-1 p-5 rounded-xl border-2 text-left transition-all ${
            tab === 'sessions'
              ? 'border-htg-sage bg-htg-sage/10'
              : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
          }`}
        >
          <p className="font-serif font-bold text-lg text-htg-fg">Sesje pojedyncze</p>
          <p className="text-htg-fg-muted text-sm mt-1">Wybierz konkretne sesje z dowolnych miesięcy. Kupujesz dokładnie to, co chcesz.</p>
          <p className="text-htg-sage font-bold text-lg mt-2">{prices.sessionAmount} PLN <span className="text-sm font-normal text-htg-fg-muted">/ sesja</span></p>
        </button>
        <button
          onClick={() => setTab('monthly')}
          className={`flex-1 p-5 rounded-xl border-2 text-left transition-all ${
            tab === 'monthly'
              ? 'border-htg-sage bg-htg-sage/10'
              : 'border-htg-card-border bg-htg-card hover:border-htg-sage/40'
          }`}
        >
          <p className="font-serif font-bold text-lg text-htg-fg">Pakiety miesięczne</p>
          <p className="text-htg-fg-muted text-sm mt-1">Cały zestaw sesji z danego miesiąca w niższej cenie. Dostęp na 24 miesiące.</p>
          <p className="text-htg-sage font-bold text-lg mt-2">{prices.monthlyAmount} PLN <span className="text-sm font-normal text-htg-fg-muted">/ miesiąc</span></p>
        </button>
      </div>

      {/* Sessions tab */}
      {tab === 'sessions' && (
        <div className="space-y-8">
          {monthSets.map(ms => (
            <div key={ms.id}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-bold text-lg text-htg-fg">{ms.title}</h3>
                <button
                  onClick={() => toggleAllInMonth(ms.sessions)}
                  className="text-xs text-htg-sage hover:text-htg-sage-dark transition-colors"
                >
                  {ms.sessions.every(s => selectedSessions.has(s.id)) ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ms.sessions.map(s => (
                  <SessionCard
                    key={s.id}
                    id={s.id}
                    title={s.title}
                    description={s.description || undefined}
                    selected={selectedSessions.has(s.id)}
                    onToggle={toggleSession}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly packages tab */}
      {tab === 'monthly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {monthSets.map(ms => (
            <MonthCard
              key={ms.id}
              id={ms.id}
              title={ms.title}
              sessionCount={ms.sessions.length}
              sessions={ms.sessions.map(s => ({ title: s.title }))}
              selected={selectedMonths.has(ms.id)}
              onToggle={toggleMonth}
              price={prices.monthlyAmount}
            />
          ))}
        </div>
      )}

      {/* Floating cart */}
      <FloatingCart
        count={cartCount}
        totalPrice={totalPrice}
        label={cartLabel}
        onCheckout={handleCheckout}
        onClear={() => tab === 'sessions' ? setSelectedSessions(new Set()) : setSelectedMonths(new Set())}
        loading={loading}
      />
    </div>
  );
}
