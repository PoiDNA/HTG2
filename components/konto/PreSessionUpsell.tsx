'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Video, Loader2 } from 'lucide-react';

interface Props {
  staffId: string;
  staffName: string;
  priceId: string;
  pricePln: number;   // display price in PLN (e.g. 100)
  sourceBookingId: string;
}

export function PreSessionUpsell({ staffId, staffName, priceId, pricePln, sourceBookingId }: Props) {
  const [loading, setLoading] = useState(false);
  const locale = useLocale();
  const t = useTranslations('Booking');
  async function handleBuy() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          mode: 'payment',
          locale,
          metadata: {
            type: 'pre_session',
            pre_session_staff_id: staffId,
            pre_session_source_booking_id: sourceBookingId,
          },
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Pre-session checkout error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-4 px-4 py-3 bg-purple-900/10 border border-purple-800/30 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <Video className="w-4 h-4 text-purple-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-htg-fg">
            {t('pre_session_booked', { name: staffName })}
          </p>
          <p className="text-xs text-htg-fg-muted">{t('pre_session_desc')}</p>
        </div>
      </div>
      <button
        onClick={handleBuy}
        disabled={loading}
        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : `${t('buy_pre_session')} — ${pricePln} PLN`}
      </button>
    </div>
  );
}
