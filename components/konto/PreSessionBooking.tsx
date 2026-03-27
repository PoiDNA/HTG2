'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Calendar, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
}

interface Props {
  eligibilityId: string;
  staffMember: { id: string; name: string; slug: string };
  settings: { note_for_client: string | null };
  slots: Slot[];
  locale: string;
}

export function PreSessionBooking({ eligibilityId, staffMember, settings, slots, locale }: Props) {
  const router = useRouter();
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Group slots by date
  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    (acc[slot.slot_date] = acc[slot.slot_date] || []).push(slot);
    return acc;
  }, {});

  const dates = Object.keys(slotsByDate).sort();

  async function handleBook() {
    if (!selectedSlot) return;
    setBooking(true);
    setError('');
    try {
      const res = await fetch('/api/pre-session/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          staffMemberId: staffMember.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Błąd rezerwacji');
        return;
      }
      setConfirmed(true);
      router.refresh();
    } finally {
      setBooking(false);
    }
  }

  if (confirmed) {
    return (
      <div className="bg-purple-900/20 border border-purple-800/40 rounded-xl p-6 text-center">
        <Video className="w-10 h-10 text-purple-400 mx-auto mb-3" />
        <h3 className="font-semibold text-htg-fg text-lg">Spotkanie zarezerwowane!</h3>
        <p className="text-htg-fg-muted text-sm mt-2">
          {selectedSlot && (
            <>
              {new Date(selectedSlot.slot_date).toLocaleDateString('pl-PL', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}{' '}
              o {selectedSlot.start_time.slice(0, 5)}–{selectedSlot.end_time.slice(0, 5)}
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-purple-900/20 border-b border-purple-800/30 px-6 py-4 flex items-center gap-3">
        <Video className="w-5 h-5 text-purple-400" />
        <div>
          <h3 className="font-semibold text-htg-fg">
            Spotkanie wstępne z {staffMember.name}
          </h3>
          <p className="text-xs text-htg-fg-muted">15 minut online przed Twoją sesją</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Note from assistant */}
        {settings.note_for_client && (
          <div className="flex gap-3 p-3 bg-htg-surface rounded-lg text-sm text-htg-fg-muted">
            <AlertCircle className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
            <p>{settings.note_for_client}</p>
          </div>
        )}

        {/* Slot picker */}
        {slots.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-10 h-10 text-htg-fg-muted mx-auto mb-3 opacity-30" />
            <p className="text-htg-fg-muted text-sm">
              Brak dostępnych terminów — asystentka wkrótce doda nowe
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-htg-fg">Wybierz termin:</p>

            {dates.map(date => (
              <div key={date}>
                <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wide mb-2">
                  {new Date(date).toLocaleDateString('pl-PL', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {slotsByDate[date].map(slot => (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlot(selectedSlot?.id === slot.id ? null : slot)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedSlot?.id === slot.id
                          ? 'bg-purple-600 text-white'
                          : 'bg-htg-surface border border-htg-card-border text-htg-fg hover:border-purple-400'
                      }`}
                    >
                      {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Booking info */}
        <div className="text-xs text-htg-fg-muted bg-htg-surface rounded-lg px-4 py-3">
          ℹ️ Spotkania wstępne są bezpłatne. Po rezerwacji termin jest ostateczny — nie można go przełożyć ani odwołać.
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        {/* Confirm button */}
        {selectedSlot && (
          <button
            onClick={handleBook}
            disabled={booking}
            className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {booking
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Rezerwuję…</>
              : <>Zarezerwuj {selectedSlot.start_time.slice(0, 5)} — {new Date(selectedSlot.slot_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}</>}
          </button>
        )}
      </div>
    </div>
  );
}
