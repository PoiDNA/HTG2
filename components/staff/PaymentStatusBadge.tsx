'use client';

import { useState, useRef, useEffect } from 'react';

const PAYMENT_OPTIONS = [
  { value: 'confirmed_paid', label: 'Opłacona', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'installments', label: 'Raty', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'pending_verification', label: 'Do potwierdzenia', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
];

export default function PaymentStatusBadge({
  bookingId,
  initialStatus,
  canEdit = false,
}: {
  bookingId: string;
  initialStatus: string;
  canEdit?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus || 'pending_verification');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = PAYMENT_OPTIONS.find(o => o.value === status) || PAYMENT_OPTIONS[2];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function changeStatus(newStatus: string) {
    setSaving(true);
    setOpen(false);
    try {
      await fetch(`/api/booking/${bookingId}/payment-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: newStatus }),
      });
      setStatus(newStatus);
    } catch {}
    setSaving(false);
  }

  if (!canEdit) {
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${current.className}`}>
        {current.label}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        disabled={saving}
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-current/20 transition-all ${current.className} ${saving ? 'opacity-50' : ''}`}
      >
        {saving ? '...' : current.label}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-htg-card border border-htg-card-border rounded-lg shadow-xl p-1 min-w-[140px]">
          {PAYMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); changeStatus(opt.value); }}
              className={`block w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                opt.value === status
                  ? opt.className + ' ring-1 ring-current/20'
                  : 'text-htg-fg-muted hover:bg-htg-surface'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
