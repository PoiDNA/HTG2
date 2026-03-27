'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import BookingCountdown from './BookingCountdown';

interface BookingCardProps {
  booking: Booking;
  locale: string;
  hasEarlierSlots?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-htg-sage/10 text-htg-sage',
  completed: 'bg-htg-surface text-htg-fg-muted',
  cancelled: 'bg-red-50 text-red-600',
  transferred: 'bg-blue-50 text-blue-600',
};

export default function BookingCard({ booking, locale, hasEarlierSlots }: BookingCardProps) {
  const t = useTranslations('Booking');
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [topics, setTopics] = useState(booking.topics || '');
  const [topicsSaved, setTopicsSaved] = useState(false);
  const [savingTopics, setSavingTopics] = useState(false);

  const config = SESSION_CONFIG[booking.session_type];
  const slot = booking.slot;

  const dateStr = slot
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(slot.slot_date + 'T00:00:00'))
    : '';

  const timeStr = slot ? `${slot.start_time} – ${slot.end_time}` : '';
  const statusKey = `status_${booking.status}` as const;

  async function handleConfirm() {
    setLoading('confirm');
    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading('cancel');
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
      setShowCancelDialog(false);
    }
  }

  const isPending = booking.status === 'pending_confirmation';
  const isConfirmed = booking.status === 'confirmed';
  const isActive = isPending || isConfirmed;

  // 14-day cancellation window from purchase date (created_at)
  const purchaseDate = booking.created_at ? new Date(booking.created_at) : new Date();
  const cancelDeadline = new Date(purchaseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const canCancel = isActive && new Date() < cancelDeadline;
  const daysLeftToCancel = Math.max(0, Math.ceil((cancelDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  // Reschedule is always possible
  const canReschedule = isActive;

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
          <h4 className="font-semibold text-htg-fg text-sm">{config.label}</h4>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[booking.status] ?? ''}`}>
          {t(statusKey)}
        </span>
      </div>

      {slot && (
        <div className="text-sm text-htg-fg-muted mb-3">
          <p className="capitalize">{dateStr}</p>
          <p className="font-medium text-htg-fg">{timeStr}</p>
        </div>
      )}

      {isPending && booking.expires_at && (
        <div className="mb-3">
          <BookingCountdown expiresAt={booking.expires_at} />
        </div>
      )}

      {/* Topics / zagadnienia */}
      {isActive && (
        <div className="mb-3 pt-3 border-t border-htg-card-border">
          <label className="block">
            <span className="text-xs font-medium text-htg-fg-muted mb-1 block">
              Zagadnienia na sesję
            </span>
            <textarea
              value={topics}
              onChange={e => { setTopics(e.target.value); setTopicsSaved(false); }}
              rows={3}
              maxLength={500}
              placeholder="Opisz, nad czym chciałbyś/chciałabyś pracować podczas sesji..."
              className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
            />
          </label>
          {topics !== (booking.topics || '') && (
            <button
              onClick={async () => {
                setSavingTopics(true);
                await fetch(`/api/booking/topics`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bookingId: booking.id, topics }),
                });
                setSavingTopics(false);
                setTopicsSaved(true);
                setTimeout(() => setTopicsSaved(false), 3000);
              }}
              disabled={savingTopics}
              className="mt-1 text-xs text-htg-sage hover:text-htg-sage-dark font-medium"
            >
              {savingTopics ? 'Zapisywanie...' : topicsSaved ? 'Zapisano ✓' : 'Zapisz zagadnienia'}
            </button>
          )}
          {topicsSaved && <span className="text-xs text-green-400 ml-2">✓</span>}
        </div>
      )}

      {isActive && (
        <div className="space-y-3 pt-3 border-t border-htg-card-border">
          <div className="flex flex-wrap gap-2">
            {isPending && (
              <button
                onClick={handleConfirm}
                disabled={loading === 'confirm'}
                className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
              >
                {loading === 'confirm' ? t('loading') : t('confirm_btn')}
              </button>
            )}

            {/* Reschedule — always available */}
            {canReschedule && (
              <button
                onClick={() => {
                  document.getElementById('booking-calendar')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-htg-surface text-htg-fg px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-card-border transition-colors"
              >
                Zmień termin
              </button>
            )}

          {/* Cancel — only within 14 days of purchase */}
            {canCancel && !showCancelDialog && (
              <button
                onClick={() => setShowCancelDialog(true)}
                className="text-red-600 hover:text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Anuluj sesję
              </button>
            )}
            {canCancel && showCancelDialog && (
              <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg">
                <span className="text-sm text-red-700">Na pewno anulować?</span>
                <button
                  onClick={handleCancel}
                  disabled={loading === 'cancel'}
                  className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {loading === 'cancel' ? '...' : 'Tak, anuluj'}
                </button>
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="text-red-600 px-3 py-1.5 rounded text-xs font-medium hover:bg-red-100 transition-colors"
                >
                  Nie
                </button>
              </div>
            )}
          </div>

          {/* Cancellation info */}
          <p className="text-xs text-htg-fg-muted">
            {canCancel
              ? `Możesz anulować sesję jeszcze przez ${daysLeftToCancel} ${daysLeftToCancel === 1 ? 'dzień' : daysLeftToCancel < 5 ? 'dni' : 'dni'} (do 14 dni od zakupu). Zmiana terminu możliwa w każdym momencie.`
              : 'Okres anulowania minął. Zmiana terminu możliwa w każdym momencie.'
            }
          </p>
        </div>
      )}
    </div>
  );
}
