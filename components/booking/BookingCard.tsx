'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import BookingCountdown from './BookingCountdown';
import { useReschedule } from './ActiveBookingsSection';

interface BookingCardProps {
  booking: Booking;
  locale: string;
  hasEarlierSlots?: boolean;
  countdownPhrase?: string | null;
  /** Countdown months line, e.g. "1 miesiąc" */
  countdownMonths?: string | null;
  /** Countdown days line, e.g. "17 dni" */
  countdownDays?: string | null;
  /** Countdown suffix, e.g. "do sesji" */
  countdownSuffix?: string | null;
  isPast?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-htg-sage/10 text-htg-sage',
  completed: 'bg-htg-surface text-htg-fg-muted',
  cancelled: 'bg-red-50 text-red-600',
  transferred: 'bg-blue-50 text-blue-600',
};

export default function BookingCard({ booking, locale, hasEarlierSlots, countdownPhrase, countdownMonths, countdownDays, countdownSuffix, isPast }: BookingCardProps) {
  const t = useTranslations('Booking');
  const router = useRouter();
  const { toggleReschedule, rescheduleBookingId } = useReschedule();
  const [loading, setLoading] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDelayOptions, setShowDelayOptions] = useState(false);
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

  // Session time calculations
  const sessionDateTime = slot ? new Date(slot.slot_date + 'T' + slot.start_time + '+02:00') : null; // CEST
  const hoursUntilSession = sessionDateTime ? (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60) : Infinity;

  // Reschedule: only for future sessions, guaranteed >48h before, conditional <48h
  const canReschedule = isActive && hoursUntilSession > 0;
  const isGuaranteedReschedule = hoursUntilSession > 48;
  const isConditionalReschedule = hoursUntilSession <= 48 && hoursUntilSession > 0;

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
            <h4 className="font-semibold text-htg-fg text-sm">{config.label}</h4>
          </div>
          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap mt-1.5 ${STATUS_STYLES[booking.status] ?? ''}`}>
            {t(statusKey)}
          </span>
        </div>
        {(countdownMonths || countdownDays) && (
          <div className="text-right shrink-0" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {countdownMonths && (
              <p className="text-5xl font-bold text-htg-sage leading-none">{countdownMonths}</p>
            )}
            {countdownDays && (
              <p className="text-5xl font-bold text-htg-sage leading-none mt-1">{countdownDays}</p>
            )}
            <p className="text-sm text-htg-sage mt-1">{countdownSuffix}</p>
          </div>
        )}
      </div>

      {slot && (
        <div className="text-sm text-htg-fg-muted mb-3">
          <p className="capitalize">{dateStr}</p>
          <p className="font-medium text-htg-fg">{timeStr}</p>
        </div>
      )}

      {countdownPhrase && (
        <div className="bg-htg-sage/5 border border-htg-sage/20 rounded-lg px-3 py-2.5 mb-3">
          <p className="text-sm text-htg-sage italic">{countdownPhrase}</p>
        </div>
      )}

      {/* Payment status */}
      {booking.orders && booking.orders.length > 0 && isActive && (() => {
        const orders = booking.orders!;
        const paidTotal = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total_amount, 0);
        const firstOrder = orders[0];
        const meta = firstOrder?.metadata;
        const isInstallment = meta?.payment_mode === 'installments';
        const fullAmount = meta?.total_amount ? parseInt(meta.total_amount) : 0;
        const installmentsPaid = orders.filter(o => o.status === 'paid').length;
        const installmentsTotal = meta?.installments_total ? parseInt(meta.installments_total) : 1;
        const remaining = fullAmount > 0 ? fullAmount - paidTotal : 0;

        if (!isInstallment && paidTotal > 0) {
          return (
            <div className="bg-green-900/20 border border-green-800/30 rounded-lg px-3 py-2 mb-3 text-xs">
              <span className="text-green-400 font-medium">✓ Zapłacono {(paidTotal / 100).toLocaleString('pl-PL')} PLN</span>
            </div>
          );
        }

        if (isInstallment) {
          const nextInstallmentDate = new Date(firstOrder.created_at);
          nextInstallmentDate.setDate(nextInstallmentDate.getDate() + 30 * installmentsPaid);
          const nextDateStr = nextInstallmentDate.toLocaleDateString('pl-PL');

          return (
            <div className="bg-htg-surface rounded-lg px-3 py-2.5 mb-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-htg-fg-muted">Wpłacono</span>
                <span className="text-green-400 font-medium">{(paidTotal / 100).toLocaleString('pl-PL')} PLN</span>
              </div>
              {remaining > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-htg-fg-muted">Pozostało</span>
                    <span className="text-htg-warm font-medium">{(remaining / 100).toLocaleString('pl-PL')} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-htg-fg-muted">Rata {installmentsPaid + 1}/{installmentsTotal}</span>
                    <span className="text-htg-fg-muted">termin: {nextDateStr}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-htg-card-border rounded-full h-1.5 mt-1">
                    <div
                      className="bg-htg-sage h-1.5 rounded-full transition-all"
                      style={{ width: `${fullAmount > 0 ? (paidTotal / fullAmount) * 100 : 0}%` }}
                    />
                  </div>
                </>
              )}
              {remaining <= 0 && (
                <span className="text-green-400 font-medium">✓ Wszystkie raty zapłacone</span>
              )}
            </div>
          );
        }

        return null;
      })()}

      {isPending && booking.expires_at && (
        <div className="mb-3">
          <BookingCountdown expiresAt={booking.expires_at} />
        </div>
      )}

      {/* Topics / zagadnienia — hidden for past sessions */}
      {isActive && !isPast && (
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

      {isActive && !isPast && (
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

            {/* Join live session — active 30 min before session and during session */}
            {isConfirmed && sessionDateTime && hoursUntilSession <= 0.5 && hoursUntilSession > -3 && booking.live_session_id && (
              <a
                href={`/pl/live/${booking.live_session_id}`}
                className="bg-htg-warm text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-htg-warm/90 transition-colors animate-pulse"
              >
                🎙️ Dołącz do sesji
              </a>
            )}

            {/* Session today but not yet 30 min before */}
            {isConfirmed && sessionDateTime && hoursUntilSession > 0.5 && hoursUntilSession <= 24 && (
              <span className="text-xs text-htg-fg-muted bg-htg-surface px-3 py-2 rounded-lg">
                Sesja dziś — poczekalnia otworzy się 30 min przed sesją
              </span>
            )}

            {/* Delay / late notice — 1h before session, max 15 min */}
            {isConfirmed && sessionDateTime && hoursUntilSession <= 1 && hoursUntilSession > -0.5 && !showDelayOptions && (
              <button
                onClick={() => setShowDelayOptions(true)}
                className="bg-htg-warm/20 text-htg-warm px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-warm/30 transition-colors"
              >
                ⏰ Zgłoś spóźnienie
              </button>
            )}

            {/* Reschedule — toggle inline calendar */}
            {canReschedule && (
              <button
                onClick={() => toggleReschedule(booking.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  rescheduleBookingId === booking.id
                    ? 'bg-htg-sage text-white'
                    : 'bg-htg-surface text-htg-fg hover:bg-htg-card-border'
                }`}
              >
                {rescheduleBookingId === booking.id ? 'Ukryj kalendarz' : 'Zmień termin'}
              </button>
            )}
          </div>

          {/* Delay options */}
          {showDelayOptions && (
            <div className="bg-htg-surface rounded-xl p-4 space-y-3">
              <p className="text-sm text-htg-fg font-medium">O ile minut się spóźnisz?</p>
              <div className="flex gap-2">
                {[5, 10, 15].map(mins => (
                  <button
                    key={mins}
                    onClick={async () => {
                      setLoading('delay');
                      const res = await fetch('/api/booking/delay', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookingId: booking.id, delayMinutes: mins }),
                      });
                      if (res.ok) {
                        setShowDelayOptions(false);
                        router.refresh();
                      }
                      setLoading(null);
                    }}
                    disabled={loading === 'delay'}
                    className="flex-1 py-2.5 rounded-lg bg-htg-warm/20 text-htg-warm text-sm font-medium hover:bg-htg-warm/30 transition-colors disabled:opacity-50"
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDelayOptions(false)}
                className="text-xs text-htg-fg-muted hover:text-htg-fg"
              >
                Anuluj
              </button>
            </div>
          )}

          {/* Reschedule info — shown only when clicking "Zmień termin" (at calendar section) */}
        </div>
      )}
    </div>
  );
}
