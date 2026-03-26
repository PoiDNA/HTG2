'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { AvailabilityRule, AvailabilityException } from '@/lib/booking/types';

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

export default function StaffScheduleEditor() {
  const t = useTranslations('Staff');

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newRuleDay, setNewRuleDay] = useState(1);
  const [newRuleStart, setNewRuleStart] = useState('09:00');
  const [newRuleEnd, setNewRuleEnd] = useState('17:00');

  // New exception form
  const [newExDate, setNewExDate] = useState('');
  const [newExReason, setNewExReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rulesRes, exRes] = await Promise.all([
      fetch('/api/staff/availability').then(r => r.json()),
      fetch('/api/staff/exceptions').then(r => r.json()),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(exRes.exceptions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addRule = async () => {
    const res = await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day_of_week: newRuleDay,
        start_time: newRuleStart,
        end_time: newRuleEnd,
      }),
    });
    if (res.ok) fetchData();
  };

  const deleteRule = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchData();
  };

  const addException = async () => {
    if (!newExDate) return;
    const res = await fetch('/api/staff/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: newExDate,
        reason: newExReason || null,
      }),
    });
    if (res.ok) {
      setNewExDate('');
      setNewExReason('');
      fetchData();
    }
  };

  const deleteException = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/staff/exceptions?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchData();
  };

  // Group rules by day_of_week
  const rulesByDay = Array.from({ length: 7 }, (_, i) =>
    rules.filter(r => r.day_of_week === i)
  );

  if (loading) {
    return <p className="text-htg-fg-muted">{t('loading')}</p>;
  }

  return (
    <div className="space-y-8">
      {/* Weekly schedule */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('weekly_schedule')}</h3>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => (
            <div key={dayIdx} className="border border-htg-card-border rounded-lg p-3">
              <h4 className="text-sm font-medium text-htg-fg mb-2">{t(DAY_KEYS[dayIdx])}</h4>
              {rulesByDay[dayIdx].length === 0 ? (
                <p className="text-xs text-htg-fg-muted">&mdash;</p>
              ) : (
                <div className="space-y-1">
                  {rulesByDay[dayIdx].map(rule => (
                    <div key={rule.id} className="flex items-center justify-between text-xs">
                      <span className="text-htg-fg">{rule.start_time}&ndash;{rule.end_time}</span>
                      <button onClick={() => deleteRule(rule.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add rule */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('col_day')}</label>
            <select
              value={newRuleDay}
              onChange={e => setNewRuleDay(Number(e.target.value))}
              className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            >
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <option key={d} value={d}>{t(DAY_KEYS[d])}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('start_time')}</label>
            <input
              type="time"
              value={newRuleStart}
              onChange={e => setNewRuleStart(e.target.value)}
              className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('end_time')}</label>
            <input
              type="time"
              value={newRuleEnd}
              onChange={e => setNewRuleEnd(e.target.value)}
              className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            />
          </div>
          <button
            onClick={addRule}
            className="flex items-center gap-1 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('add_rule')}
          </button>
        </div>
      </div>

      {/* Exceptions */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('exceptions')}</h3>

        {exceptions.length === 0 ? (
          <p className="text-sm text-htg-fg-muted mb-4">{t('no_exceptions')}</p>
        ) : (
          <div className="space-y-2 mb-4">
            {exceptions.map(ex => (
              <div key={ex.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-2">
                <div>
                  <span className="text-sm font-medium text-htg-fg">{ex.exception_date}</span>
                  {ex.reason && <span className="text-sm text-htg-fg-muted ml-2">&mdash; {ex.reason}</span>}
                </div>
                <button onClick={() => deleteException(ex.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('exception_date')}</label>
            <input
              type="date"
              value={newExDate}
              onChange={e => setNewExDate(e.target.value)}
              className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('exception_reason')}</label>
            <input
              type="text"
              value={newExReason}
              onChange={e => setNewExReason(e.target.value)}
              className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
              placeholder={t('exception_reason')}
            />
          </div>
          <button
            onClick={addException}
            className="flex items-center gap-1 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('add_exception')}
          </button>
        </div>
      </div>
    </div>
  );
}
