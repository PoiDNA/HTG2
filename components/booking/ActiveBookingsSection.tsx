'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import BookingCalendar from './BookingCalendar';
import { ALL_SESSION_TYPES } from '@/lib/booking/constants';

interface RescheduleContextValue {
  rescheduleBookingId: string | null;
  toggleReschedule: (bookingId: string) => void;
}

const RescheduleContext = createContext<RescheduleContextValue>({
  rescheduleBookingId: null,
  toggleReschedule: () => {},
});

export function useReschedule() {
  return useContext(RescheduleContext);
}

interface ActiveBookingsSectionProps {
  locale: string;
  children: React.ReactNode;
}

export default function ActiveBookingsSection({
  locale,
  children,
}: ActiveBookingsSectionProps) {
  const t = useTranslations('Booking');
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null);

  const toggleReschedule = useCallback((bookingId: string) => {
    setRescheduleBookingId((prev) => (prev === bookingId ? null : bookingId));
  }, []);

  return (
    <RescheduleContext.Provider value={{ rescheduleBookingId, toggleReschedule }}>
      {children}

      {/* Inline calendar — shown only when rescheduling */}
      {rescheduleBookingId && (
        <div className="bg-htg-surface/50 border border-htg-card-border rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-serif font-semibold text-htg-fg">{t('reschedule')}</h3>
              <p className="text-xs text-htg-warm mt-1">
                ⚠ {t('reschedule_confirm_message')}
              </p>
            </div>
            <button
              onClick={() => setRescheduleBookingId(null)}
              className="text-htg-fg-muted hover:text-htg-fg text-sm px-2 py-1"
            >
              ✕
            </button>
          </div>
          <BookingCalendar
            sessionTypes={ALL_SESSION_TYPES}
            locale={locale}
            rescheduleBookingId={rescheduleBookingId}
            onRescheduleComplete={() => setRescheduleBookingId(null)}
          />
        </div>
      )}
    </RescheduleContext.Provider>
  );
}
