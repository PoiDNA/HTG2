'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { StaffMember, AvailabilityRule, AvailabilityException, SessionType } from '@/lib/booking/types';
import { ALL_SESSION_TYPES, SESSION_CONFIG } from '@/lib/booking/constants';

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

export default function CalendarManager() {
  const t = useTranslations('Admin');

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(false);

  // New rule form
  const [newRuleDay, setNewRuleDay] = useState(1);
  const [newRuleStart, setNewRuleStart] = useState('09:00');
  const [newRuleEnd, setNewRuleEnd] = useState('17:00');

  // New exception form
  const [newExDate, setNewExDate] = useState('');
  const [newExReason, setNewExReason] = useState('');

  // Slot generation form
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');
  const [genType, setGenType] = useState<SessionType>('natalia_solo');
  const [genResult, setGenResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fetch staff list
  useEffect(() => {
    fetch('/api/admin/staff')
      .then(r => r.json())
      .then(data => {
        if (data.staff) {
          setStaff(data.staff);
          if (data.staff.length > 0) setSelectedStaff(data.staff[0].id);
        }
      });
  }, []);

  // Fetch rules and exceptions when staff changes
  const fetchRulesAndExceptions = useCallback(async () => {
    if (!selectedStaff) return;
    setLoading(true);
    const [rulesRes, exRes] = await Promise.all([
      fetch(`/api/admin/availability?staff_id=${selectedStaff}`).then(r => r.json()),
      fetch(`/api/admin/exceptions?staff_id=${selectedStaff}`).then(r => r.json()),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(exRes.exceptions ?? []);
    setLoading(false);
  }, [selectedStaff]);

  useEffect(() => {
    fetchRulesAndExceptions();
  }, [fetchRulesAndExceptions]);

  const addRule = async () => {
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: selectedStaff,
        day_of_week: newRuleDay,
        start_time: newRuleStart,
        end_time: newRuleEnd,
      }),
    });
    if (res.ok) fetchRulesAndExceptions();
  };

  const deleteRule = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/admin/availability?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchRulesAndExceptions();
  };

  const addException = async () => {
    if (!newExDate) return;
    const res = await fetch('/api/admin/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: selectedStaff,
        date: newExDate,
        reason: newExReason || null,
      }),
    });
    if (res.ok) {
      setNewExDate('');
      setNewExReason('');
      fetchRulesAndExceptions();
    }
  };

  const deleteException = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/admin/exceptions?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchRulesAndExceptions();
  };

  const generateSlots = async () => {
    if (!genFrom || !genTo) return;
    setGenerating(true);
    setGenResult(null);
    const res = await fetch('/api/admin/slots/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date_from: genFrom,
        date_to: genTo,
        session_type: genType,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setGenResult(t('generated_count', { count: data.count }));
    } else {
      setGenResult(data.error || t('error'));
    }
    setGenerating(false);
  };

  // Group rules by day_of_week for display
  const rulesByDay = Array.from({ length: 7 }, (_, i) =>
    rules.filter(r => r.day_of_week === i)
  );

  return (
    <div className="space-y-8">
      {/* Staff selector */}
      <div>
        <label className="block text-sm font-medium text-htg-fg mb-2">{t('staff_select')}</label>
        <select
          value={selectedStaff}
          onChange={e => setSelectedStaff(e.target.value)}
          className="bg-htg-card border border-htg-card-border rounded-lg px-4 py-2 text-sm text-htg-fg"
        >
          {staff.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-htg-fg-muted">{t('loading')}</p>
      ) : (
        <>
          {/* Weekly schedule */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
            <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('weekly_schedule')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => (
                <div key={dayIdx} className="border border-htg-card-border rounded-lg p-3">
                  <h3 className="text-sm font-medium text-htg-fg mb-2">{t(DAY_KEYS[dayIdx])}</h3>
                  {rulesByDay[dayIdx].length === 0 ? (
                    <p className="text-xs text-htg-fg-muted">—</p>
                  ) : (
                    <div className="space-y-1">
                      {rulesByDay[dayIdx].map(rule => (
                        <div key={rule.id} className="flex items-center justify-between text-xs">
                          <span className="text-htg-fg">{rule.start_time}–{rule.end_time}</span>
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
                <label className="block text-xs text-htg-fg-muted mb-1">{t('col_date')}</label>
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
            <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('exceptions')}</h2>

            {exceptions.length === 0 ? (
              <p className="text-sm text-htg-fg-muted mb-4">{t('no_data')}</p>
            ) : (
              <div className="space-y-2 mb-4">
                {exceptions.map(ex => (
                  <div key={ex.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-2">
                    <div>
                      <span className="text-sm font-medium text-htg-fg">{ex.exception_date}</span>
                      {ex.reason && <span className="text-sm text-htg-fg-muted ml-2">— {ex.reason}</span>}
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

          {/* Generate slots */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
            <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('generate_slots')}</h2>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">{t('date_from')}</label>
                <input
                  type="date"
                  value={genFrom}
                  onChange={e => setGenFrom(e.target.value)}
                  className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                />
              </div>
              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">{t('date_to')}</label>
                <input
                  type="date"
                  value={genTo}
                  onChange={e => setGenTo(e.target.value)}
                  className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                />
              </div>
              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">{t('session_type')}</label>
                <select
                  value={genType}
                  onChange={e => setGenType(e.target.value as SessionType)}
                  className="bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                >
                  {ALL_SESSION_TYPES.map(st => (
                    <option key={st} value={st}>{SESSION_CONFIG[st].labelShort}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={generateSlots}
                disabled={generating}
                className="bg-htg-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-indigo-light transition-colors disabled:opacity-50"
              >
                {generating ? t('loading') : t('generate')}
              </button>
            </div>

            {genResult && (
              <p className="mt-3 text-sm text-htg-sage-dark font-medium">{genResult}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
