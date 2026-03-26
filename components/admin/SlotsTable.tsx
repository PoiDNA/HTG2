'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SESSION_CONFIG, ALL_SESSION_TYPES } from '@/lib/booking/constants';
import type { BookingSlot, SessionType, SlotStatus } from '@/lib/booking/types';

const STATUSES: SlotStatus[] = ['available', 'held', 'booked', 'completed', 'cancelled'];

const STATUS_KEY: Record<SlotStatus, string> = {
  available: 'slot_available',
  held: 'slot_held',
  booked: 'slot_booked',
  completed: 'slot_completed',
  cancelled: 'slot_cancelled',
};

export default function SlotsTable() {
  const t = useTranslations('Admin');
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const fetchSlots = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (filterType) params.set('session_type', filterType);
    if (filterStatus) params.set('status', filterStatus);

    const res = await fetch(`/api/admin/slots?${params.toString()}`);
    const data = await res.json();
    setSlots(data.slots ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const cancelSlot = async (id: string) => {
    if (!confirm(t('confirm_cancel'))) return;
    await fetch(`/api/admin/slots?id=${id}&action=cancel`, { method: 'PATCH' });
    fetchSlots();
  };

  const releaseHold = async (id: string) => {
    await fetch(`/api/admin/slots?id=${id}&action=release`, { method: 'PATCH' });
    fetchSlots();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold text-htg-fg">{t('slots_title')}</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-htg-fg-muted mb-1">{t('filter_date_from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
          />
        </div>
        <div>
          <label className="block text-xs text-htg-fg-muted mb-1">{t('filter_date_to')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
          />
        </div>
        <div>
          <label className="block text-xs text-htg-fg-muted mb-1">{t('filter_session_type')}</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
          >
            <option value="">{t('filter_all')}</option>
            {ALL_SESSION_TYPES.map(st => (
              <option key={st} value={st}>{SESSION_CONFIG[st].labelShort}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-htg-fg-muted mb-1">{t('filter_status')}</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
          >
            <option value="">{t('filter_all')}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{t(STATUS_KEY[s])}</option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchSlots}
          className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors"
        >
          {t('apply_filters')}
        </button>
      </div>

      {loading ? (
        <p className="text-htg-fg-muted">{t('loading')}</p>
      ) : slots.length === 0 ? (
        <p className="text-htg-fg-muted">{t('no_data')}</p>
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-htg-card-border text-left">
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_date')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_time')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_session_type')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_status')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot.id} className="border-b border-htg-card-border last:border-0">
                  <td className="py-3 px-4 text-htg-fg">{slot.slot_date}</td>
                  <td className="py-3 px-4 text-htg-fg-muted">{slot.start_time}–{slot.end_time}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${SESSION_CONFIG[slot.session_type]?.color ?? ''}`} />
                    {SESSION_CONFIG[slot.session_type]?.labelShort ?? slot.session_type}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      slot.status === 'available' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                      slot.status === 'held' ? 'bg-htg-warm/20 text-htg-warm-text' :
                      slot.status === 'booked' ? 'bg-htg-indigo/20 text-htg-indigo' :
                      slot.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-htg-surface text-htg-fg-muted'
                    }`}>
                      {t(STATUS_KEY[slot.status])}
                    </span>
                  </td>
                  <td className="py-3 px-4 space-x-2">
                    {slot.status === 'available' && (
                      <button
                        onClick={() => cancelSlot(slot.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        {t('cancel_slot')}
                      </button>
                    )}
                    {slot.status === 'held' && (
                      <button
                        onClick={() => releaseHold(slot.id)}
                        className="text-htg-indigo hover:text-htg-indigo-light text-xs font-medium"
                      >
                        {t('release_hold')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
