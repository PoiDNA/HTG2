'use client';

import { useState } from 'react';
import type { Booking } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import BookingCard from './BookingCard';

interface PastBookingAccordionProps {
  bookings: Booking[];
  locale: string;
}

export default function PastBookingAccordion({ bookings, locale }: PastBookingAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {bookings.map((booking) => {
        const config = SESSION_CONFIG[booking.session_type];
        const slot = booking.slot;
        const dateStr = slot
          ? new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(slot.slot_date + 'T00:00:00'))
          : '';
        const isOpen = openId === booking.id;

        return (
          <div key={booking.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : booking.id)}
              className="w-full flex items-center justify-between gap-3 bg-htg-card border border-htg-card-border rounded-xl px-5 py-3 opacity-60 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2 text-left">
                <span className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
                <span className="font-semibold text-htg-fg text-sm">{config.label}</span>
                {dateStr && (
                  <span className="text-xs text-htg-fg-muted ml-1">— {dateStr}</span>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-htg-fg-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isOpen && (
              <div className="mt-1 opacity-60">
                <BookingCard booking={booking} locale={locale} isPast />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
