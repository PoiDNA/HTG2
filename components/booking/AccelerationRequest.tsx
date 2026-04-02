'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { AccelerationEntry, SessionType } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';

interface AccelerationRequestProps {
  sessionType: SessionType;
  bookingId?: string;
  existingEntry?: AccelerationEntry | null;
  locale: string;
}

export default function AccelerationRequest({
  sessionType,
  bookingId,
  existingEntry,
  locale,
}: AccelerationRequestProps) {
  const t = useTranslations('Booking');
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleRequest() {
    setLoading('request');
    try {
      const res = await fetch('/api/booking/accelerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionType, bookingId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleAcceptOffer() {
    if (!existingEntry?.offered_slot_id || !bookingId) return;
    setLoading('accept');
    try {
      const res = await fetch('/api/booking/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, newSlotId: existingEntry.offered_slot_id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleDeclineOffer() {
    // Decline by not acting — the offer will expire
    // For now, we just refresh
    setLoading('decline');
    router.refresh();
    setLoading(null);
  }

  // If user has been offered a slot
  if (existingEntry?.status === 'offered' && existingEntry.offered_slot) {
    const slot = existingEntry.offered_slot;
    const dateStr = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(new Date(slot.slot_date + 'T00:00:00'));

    return (
      <div className="bg-htg-sage/5 border border-htg-sage/20 rounded-xl p-4">
        <h4 className="font-semibold text-htg-fg text-sm mb-2">{t('acceleration_offered')}</h4>
        <p className="text-sm text-htg-fg mb-3">
          <span className="capitalize">{dateStr}</span> {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleAcceptOffer}
            disabled={loading === 'accept'}
            className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
          >
            {loading === 'accept' ? '...' : t('acceleration_accept')}
          </button>
          <button
            onClick={handleDeclineOffer}
            disabled={loading === 'decline'}
            className="text-htg-fg-muted hover:text-htg-fg px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-surface transition-colors"
          >
            {t('acceleration_decline')}
          </button>
        </div>
      </div>
    );
  }

  // If user is already waiting in queue
  if (existingEntry?.status === 'waiting') {
    return (
      <div className="bg-htg-surface rounded-xl p-4">
        <p className="text-sm text-htg-fg-muted">
          {t('acceleration_queue_pos', { position: existingEntry.priority })}
        </p>
      </div>
    );
  }

  // Default: show request button
  return (
    <button
      onClick={handleRequest}
      disabled={loading === 'request'}
      className="w-full bg-htg-surface text-htg-fg px-4 py-3 rounded-xl text-sm font-medium hover:bg-htg-card-border transition-colors disabled:opacity-50"
    >
      {loading === 'request' ? t('loading') : t('acceleration_btn')}
    </button>
  );
}
