'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { BookingSlot, SessionType } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import MiniCalendar from './MiniCalendar';

interface BookingCalendarProps {
  sessionTypes: SessionType[];
  locale: string;
  /** When set, clicking a slot transfers this booking instead of creating a new one */
  rescheduleBookingId?: string | null;
  /** Called after successful transfer */
  onRescheduleComplete?: () => void;
}

type GroupedSlots = Record<string, Pick<BookingSlot, 'id' | 'session_type' | 'slot_date' | 'start_time' | 'end_time' | 'status'>[]>;

export default function BookingCalendar({ sessionTypes, locale, rescheduleBookingId, onRescheduleComplete }: BookingCalendarProps) {
  const t = useTranslations('Booking');
  const router = useRouter();

  const [month, setMonth] = useState(() => new Date());
  const [slots, setSlots] = useState<GroupedSlots>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reserving, setReserving] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<BookingSlot | null>(null);
  const [topics, setTopics] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthStr });
      // If only one session type, filter by it
      if (sessionTypes.length === 1) {
        params.set('session_type', sessionTypes[0]);
      }
      const res = await fetch(`/api/booking/slots?${params}`);
      const data = await res.json();
      setSlots(data.slots ?? {});
    } catch {
      setSlots({});
    } finally {
      setLoading(false);
    }
  }, [monthStr, sessionTypes]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Build marked dates map
  const markedDates = new Map<string, number>();
  for (const [date, dateSlots] of Object.entries(slots)) {
    markedDates.set(date, dateSlots.length);
  }

  const selectedSlots = selectedDate ? (slots[selectedDate] ?? []) : [];

  const isReschedule = !!rescheduleBookingId;

  async function handleReserve(slot: typeof selectedSlots[0]) {
    setReserving(slot.id);
    setMessage(null);
    try {
      let res: Response;
      if (isReschedule) {
        // Transfer existing booking to new slot
        res = await fetch('/api/booking/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: rescheduleBookingId, newSlotId: slot.id }),
        });
      } else {
        // New reservation
        res = await fetch('/api/booking/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotId: slot.id, topics: topics || undefined }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: isReschedule ? t('success_transferred') : t('success_reserved') });
        setShowConfirmModal(null);
        setTopics('');
        router.refresh();
        fetchSlots();
        if (isReschedule) {
          onRescheduleComplete?.();
        }
      } else {
        setMessage({ type: 'error', text: data.error || t('error') });
      }
    } catch {
      setMessage({ type: 'error', text: t('error') });
    } finally {
      setReserving(null);
    }
  }

  return (
    <div id="booking-calendar" className="space-y-6">
      {!isReschedule && (
        <h3 className="text-lg font-serif font-semibold text-htg-fg">{t('calendar_title')}</h3>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Calendar */}
        <MiniCalendar
          month={month}
          selectedDate={selectedDate}
          markedDates={markedDates}
          onSelectDate={setSelectedDate}
          onMonthChange={(m) => {
            setMonth(m);
            setSelectedDate(null);
          }}
          locale={locale}
        />

        {/* Time slots for selected day */}
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-htg-fg-muted">{t('loading')}</p>
            </div>
          ) : !selectedDate ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-htg-fg-muted">{t('select_day')}</p>
            </div>
          ) : selectedSlots.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-htg-fg-muted">{t('no_slots')}</p>
            </div>
          ) : (
            <div>
              <h4 className="text-sm font-medium text-htg-fg mb-3">
                {t('available_slots')} — {t('slot_count', { count: selectedSlots.length })}
              </h4>
              <div className="space-y-2">
                {selectedSlots.map((slot) => {
                  const config = SESSION_CONFIG[slot.session_type];
                  return (
                    <button
                      key={slot.id}
                      onClick={() => setShowConfirmModal(slot as BookingSlot)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-htg-card-border hover:border-htg-sage hover:bg-htg-sage/5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
                        <div>
                          <p className="text-sm font-medium text-htg-fg">
                            {slot.start_time} – {slot.end_time}
                          </p>
                          <p className="text-xs text-htg-fg-muted">{config.labelShort}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-htg-sage">{isReschedule ? t('reschedule_select') : t('book_now')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-htg-sage/10 text-htg-sage' : 'bg-red-50 text-red-600'
        }`}>
          {message.text}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmModal(null)}>
          <div
            className="bg-htg-card rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-serif font-semibold text-htg-fg mb-2">
              {isReschedule ? t('reschedule_confirm_title') : t('confirm_title')}
            </h3>

            <div className="bg-htg-surface rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-htg-fg">
                {SESSION_CONFIG[showConfirmModal.session_type].label}
              </p>
              <p className="text-sm text-htg-fg-muted capitalize">
                {new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }).format(new Date(showConfirmModal.slot_date + 'T00:00:00'))}
              </p>
              <p className="text-sm font-medium text-htg-fg">
                {showConfirmModal.start_time} – {showConfirmModal.end_time}
              </p>
            </div>

            <p className="text-sm text-htg-fg-muted mb-4">
              {isReschedule ? t('reschedule_confirm_message') : t('confirm_message')}
            </p>

            {!isReschedule && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-htg-fg mb-1">
                  {t('topics_label')}
                </label>
                <textarea
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  placeholder={t('topics_placeholder')}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-htg-card-border bg-htg-card text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:ring-2 focus:ring-htg-sage resize-none"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => handleReserve(showConfirmModal)}
                disabled={reserving !== null}
                className="flex-1 bg-htg-sage text-white py-3 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
              >
                {reserving ? t('loading') : isReschedule ? t('reschedule_confirm_btn') : t('confirm_slot')}
              </button>
              <button
                onClick={() => setShowConfirmModal(null)}
                className="flex-1 bg-htg-surface text-htg-fg py-3 rounded-lg text-sm font-medium hover:bg-htg-card-border transition-colors"
              >
                {t('cancel_no')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
