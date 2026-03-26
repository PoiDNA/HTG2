'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface BookingCountdownProps {
  expiresAt: string;
}

function getTimeRemaining(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, total: 0 };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { hours, minutes, seconds, total: diff };
}

export default function BookingCountdown({ expiresAt }: BookingCountdownProps) {
  const t = useTranslations('Booking');
  const [remaining, setRemaining] = useState(() => getTimeRemaining(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const r = getTimeRemaining(expiresAt);
      setRemaining(r);
      if (r.total <= 0) {
        clearInterval(timer);
        // Auto-refresh page when timer hits 0
        window.location.reload();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining.total <= 0) {
    return (
      <span className="text-sm font-medium text-red-600">
        {t('expired')}
      </span>
    );
  }

  const isUrgent = remaining.total < 60 * 60 * 1000; // < 1 hour
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={`flex items-center gap-1.5 text-sm font-mono ${isUrgent ? 'text-red-600' : 'text-htg-fg-muted'}`}>
      <span className="text-xs font-sans font-medium">{t('expires_in')}</span>
      <span className="font-semibold">
        {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
      </span>
    </div>
  );
}
