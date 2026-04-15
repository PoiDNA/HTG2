'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

type Slot = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
};

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

/**
 * Client-side list of Natalia's "Otwarta" slots available for this translator
 * to claim (convert to natalia_interpreter_solo in her locale). Each row has
 * a "Dopnij się" button that POSTs to /api/translator/claim-slot and refreshes
 * the server component (router.refresh()).
 *
 * The sibling "Dostępne ze mną" section already renders claimed slots — after
 * a successful claim the slot moves there. Both are fetched server-side.
 */
export default function ClaimableSlots({
  slots,
  translatorLocale,
}: {
  slots: Slot[];
  translatorLocale: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function claim(slotId: string) {
    setError(null);
    setPendingId(slotId);
    try {
      const res = await fetch('/api/translator/claim-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd');
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  if (slots.length === 0) {
    return (
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
        <Plus className="w-10 h-10 text-htg-fg-muted mx-auto mb-3" />
        <p className="text-htg-fg-muted text-sm">
          Brak otwartych terminów Natalii do dopięcia w najbliższych 28 dniach.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {slots.map((slot) => {
          const d = new Date(slot.slot_date + 'T00:00:00');
          const isToday = slot.slot_date === todayStr;
          const loading = pendingId === slot.id || isPending;
          // End time visible to user reflects interpreter duration (180 min after claim),
          // not the current natalia_solo end_time. Compute display-only.
          const [h, m] = slot.start_time.slice(0, 5).split(':').map(Number);
          const endMin = h * 60 + m + 180;
          const endHH = String(Math.floor(endMin / 60)).padStart(2, '0');
          const endMM = String(endMin % 60).padStart(2, '0');

          return (
            <div
              key={slot.id}
              className={`bg-htg-card border rounded-lg p-3 flex items-center justify-between gap-2 ${
                isToday ? 'border-htg-sage/50 bg-htg-sage/5' : 'border-htg-card-border'
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs text-htg-fg-muted">
                  {DAY_NAMES[d.getDay()]} {slot.slot_date.split('-')[2]}.{slot.slot_date.split('-')[1]}
                  {isToday && <span className="ml-1 px-1.5 py-0.5 rounded bg-htg-sage text-white text-[10px] font-bold">DZIŚ</span>}
                </p>
                <p className="text-base font-bold text-htg-fg">
                  {slot.start_time.slice(0, 5)}&ndash;{endHH}:{endMM}
                </p>
                <p className="text-[11px] text-htg-fg-muted">+60 min vs PL solo</p>
              </div>
              <button
                onClick={() => claim(slot.id)}
                disabled={loading}
                className="flex items-center gap-1 shrink-0 bg-htg-sage text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                <Plus className="w-4 h-4" />
                {loading ? '...' : 'Dopnij'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-htg-fg-muted">
        Po dopięciu slot będzie dostępny dla klientów {translatorLocale.toUpperCase()} jako sesja z tłumaczem.
      </p>
    </div>
  );
}
