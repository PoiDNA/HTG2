'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { AccelerationEntry, SessionType } from '@/lib/booking/types';

export default function QueueManager() {
  const t = useTranslations('Admin');
  const [entries, setEntries] = useState<AccelerationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/queue');
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const assignSlot = async (entryId: string) => {
    const res = await fetch('/api/admin/slots/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: entryId }),
    });
    if (res.ok) {
      fetchQueue();
    } else {
      const data = await res.json();
      alert(data.error || t('error'));
    }
  };

  if (loading) {
    return <p className="text-htg-fg-muted">{t('loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold text-htg-fg">{t('queue_title')}</h2>

      {entries.length === 0 ? (
        <p className="text-htg-fg-muted">{t('queue_empty')}</p>
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-htg-card-border text-left">
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_user')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_session_type')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_priority')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_status')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_current_booking')}</th>
                <th className="py-3 px-4 text-htg-fg-muted font-medium">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-htg-card-border last:border-0">
                  <td className="py-3 px-4 text-htg-fg">
                    {entry.user?.email ?? entry.user_id}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${SESSION_CONFIG[entry.session_type]?.color ?? ''}`} />
                    {SESSION_CONFIG[entry.session_type]?.labelShort ?? entry.session_type}
                  </td>
                  <td className="py-3 px-4 text-htg-fg-muted">{entry.priority}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      entry.status === 'waiting' ? 'bg-htg-warm/20 text-htg-warm-text' :
                      entry.status === 'offered' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                      'bg-htg-surface text-htg-fg-muted'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-htg-fg-muted">
                    {entry.booking?.slot?.slot_date ?? '—'}
                  </td>
                  <td className="py-3 px-4">
                    {(entry.status === 'waiting' || entry.status === 'offered') && (
                      <button
                        onClick={() => assignSlot(entry.id)}
                        className="bg-htg-indigo text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-htg-indigo-light transition-colors"
                      >
                        {t('assign_slot')}
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
