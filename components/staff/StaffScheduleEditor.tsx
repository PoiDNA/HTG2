'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, CalendarPlus, Lock, UserCheck } from 'lucide-react';
import type { AvailabilityRule, AvailabilityException } from '@/lib/booking/types';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

interface SpecificDateSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  status: string;
  is_extra: boolean;
  held_for_user: string | null;
  notes: string | null;
}

export default function StaffScheduleEditor() {
  const t = useTranslations('Staff');

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [specificSlots, setSpecificSlots] = useState<SpecificDateSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newRuleDay, setNewRuleDay] = useState(1);
  const [newRuleStart, setNewRuleStart] = useState('09:00');
  const [newRuleEnd, setNewRuleEnd] = useState('17:00');

  // Blocked date form
  const [newExDate, setNewExDate] = useState('');

  // Specific date availability form
  const [specDate, setSpecDate] = useState('');
  const [specStart, setSpecStart] = useState('10:00');
  const [specEnd, setSpecEnd] = useState('12:00');
  const [specType, setSpecType] = useState<SessionType>('natalia_solo');

  // Private slot form
  const [privDate, setPrivDate] = useState('');
  const [privStart, setPrivStart] = useState('10:00');
  const [privEnd, setPrivEnd] = useState('12:00');
  const [privType, setPrivType] = useState<SessionType>('natalia_solo');
  const [privEmail, setPrivEmail] = useState('');
  const [privSaving, setPrivSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rulesRes, exRes, slotsRes] = await Promise.all([
      fetch('/api/staff/availability').then(r => r.json()),
      fetch('/api/staff/exceptions').then(r => r.json()),
      fetch('/api/staff/slots').then(r => r.ok ? r.json() : { slots: [] }),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(exRes.exceptions ?? []);
    setSpecificSlots(slotsRes.slots ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Weekly rules ──
  const addRule = async () => {
    const res = await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: newRuleDay, start_time: newRuleStart, end_time: newRuleEnd }),
    });
    if (res.ok) fetchData();
  };

  const deleteRule = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  // ── Blocked dates ──
  const addException = async () => {
    if (!newExDate) return;
    const res = await fetch('/api/staff/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newExDate }),
    });
    if (res.ok) { setNewExDate(''); fetchData(); }
  };

  const deleteException = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    await fetch(`/api/staff/exceptions?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  // ── Specific date slot ──
  const addSpecificSlot = async () => {
    if (!specDate) return;
    const res = await fetch('/api/staff/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: specDate,
        start_time: specStart,
        end_time: specEnd,
        session_type: specType,
      }),
    });
    if (res.ok) { setSpecDate(''); fetchData(); }
  };

  // ── Private slot for specific user ──
  const addPrivateSlot = async () => {
    if (!privDate || !privEmail) return;
    setPrivSaving(true);
    const res = await fetch('/api/staff/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: privDate,
        start_time: privStart,
        end_time: privEnd,
        session_type: privType,
        private_for_email: privEmail,
      }),
    });
    setPrivSaving(false);
    if (res.ok) { setPrivDate(''); setPrivEmail(''); fetchData(); }
    else {
      const data = await res.json();
      alert(data.error || 'Błąd');
    }
  };

  const deleteSlot = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    await fetch(`/api/staff/slots?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const rulesByDay = Array.from({ length: 7 }, (_, i) => rules.filter(r => r.day_of_week === i));

  const today = new Date().toISOString().split('T')[0];

  if (loading) return <p className="text-htg-fg-muted">{t('loading')}</p>;

  return (
    <div className="space-y-8">
      {/* 1. Weekly schedule */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('weekly_schedule')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => (
            <div key={dayIdx} className="border border-htg-card-border rounded-lg p-3">
              <h4 className="text-sm font-medium text-htg-fg mb-2">{t(DAY_KEYS[dayIdx])}</h4>
              {rulesByDay[dayIdx].length === 0 ? (
                <p className="text-xs text-htg-fg-muted">&mdash;</p>
              ) : (
                <div className="space-y-1">
                  {rulesByDay[dayIdx].map(rule => (
                    <div key={rule.id} className="flex items-center justify-between text-xs">
                      <span className="text-htg-fg">{rule.start_time.slice(0,5)}&ndash;{rule.end_time.slice(0,5)}</span>
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
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('col_day')}</label>
            <select value={newRuleDay} onChange={e => setNewRuleDay(Number(e.target.value))}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              {[1, 2, 3, 4, 5, 6, 0].map(d => (<option key={d} value={d}>{t(DAY_KEYS[d])}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('start_time')}</label>
            <input type="time" value={newRuleStart} onChange={e => setNewRuleStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">{t('end_time')}</label>
            <input type="time" value={newRuleEnd} onChange={e => setNewRuleEnd(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <button onClick={addRule}
            className="flex items-center gap-1 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors">
            <Plus className="w-4 h-4" /> {t('add_rule')}
          </button>
        </div>
      </div>

      {/* 2. Specific date availability */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <CalendarPlus className="w-5 h-5 text-htg-sage" />
          Dodatkowe terminy
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">Dodaj konkretne daty dostępności (poza harmonogramem tygodniowym).</p>

        {/* Existing specific slots */}
        {specificSlots.filter(s => !s.held_for_user).length > 0 && (
          <div className="space-y-2 mb-4">
            {specificSlots.filter(s => !s.held_for_user).map(slot => (
              <div key={slot.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-htg-fg">{slot.slot_date}</span>
                  <span className="text-sm text-htg-fg-muted">{slot.start_time.slice(0,5)}&ndash;{slot.end_time.slice(0,5)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    SESSION_CONFIG[slot.session_type as SessionType]?.color ?? 'bg-htg-surface'
                  } text-white`}>
                    {SESSION_CONFIG[slot.session_type as SessionType]?.labelShort ?? slot.session_type}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    slot.status === 'available' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                    slot.status === 'booked' ? 'bg-htg-indigo/20 text-htg-indigo' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>{slot.status}</span>
                </div>
                {slot.status === 'available' && (
                  <button onClick={() => deleteSlot(slot.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Data</label>
            <input type="date" value={specDate} min={today} onChange={e => setSpecDate(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Od</label>
            <input type="time" value={specStart} onChange={e => setSpecStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Do</label>
            <input type="time" value={specEnd} onChange={e => setSpecEnd(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Typ sesji</label>
            <select value={specType} onChange={e => setSpecType(e.target.value as SessionType)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              {Object.entries(SESSION_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.labelShort}</option>
              ))}
            </select>
          </div>
          <button onClick={addSpecificSlot}
            className="flex items-center gap-1 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors">
            <CalendarPlus className="w-4 h-4" /> Dodaj termin
          </button>
        </div>
      </div>

      {/* 3. Private slot for specific client */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <Lock className="w-5 h-5 text-htg-warm" />
          Prywatny termin dla klienta
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Termin widoczny tylko dla konkretnego klienta (nie pojawi się w ogólnej puli). Klient zobaczy go w swoim panelu.
        </p>

        {/* Existing private slots */}
        {specificSlots.filter(s => s.held_for_user).length > 0 && (
          <div className="space-y-2 mb-4">
            {specificSlots.filter(s => s.held_for_user).map(slot => (
              <div key={slot.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-2">
                <div className="flex items-center gap-3">
                  <UserCheck className="w-4 h-4 text-htg-warm" />
                  <span className="text-sm font-medium text-htg-fg">{slot.slot_date}</span>
                  <span className="text-sm text-htg-fg-muted">{slot.start_time.slice(0,5)}&ndash;{slot.end_time.slice(0,5)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    SESSION_CONFIG[slot.session_type as SessionType]?.color ?? 'bg-htg-surface'
                  } text-white`}>
                    {SESSION_CONFIG[slot.session_type as SessionType]?.labelShort ?? slot.session_type}
                  </span>
                  {slot.notes && <span className="text-xs text-htg-warm">{slot.notes}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    slot.status === 'held' ? 'bg-htg-warm/20 text-htg-warm-text' :
                    slot.status === 'booked' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>{slot.status === 'held' ? 'Oczekuje' : slot.status}</span>
                </div>
                {slot.status !== 'booked' && (
                  <button onClick={() => deleteSlot(slot.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Email klienta</label>
            <input type="email" value={privEmail} onChange={e => setPrivEmail(e.target.value)}
              placeholder="klient@email.com"
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg w-56" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Data</label>
            <input type="date" value={privDate} min={today} onChange={e => setPrivDate(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Od</label>
            <input type="time" value={privStart} onChange={e => setPrivStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Do</label>
            <input type="time" value={privEnd} onChange={e => setPrivEnd(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Typ</label>
            <select value={privType} onChange={e => setPrivType(e.target.value as SessionType)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              {Object.entries(SESSION_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.labelShort}</option>
              ))}
            </select>
          </div>
          <button onClick={addPrivateSlot} disabled={privSaving || !privEmail || !privDate}
            className="flex items-center gap-1 bg-htg-warm text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            <Lock className="w-4 h-4" /> {privSaving ? 'Dodawanie...' : 'Dodaj prywatny termin'}
          </button>
        </div>
      </div>

      {/* 4. Blocked dates */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('exceptions')}</h3>
        {exceptions.length === 0 ? (
          <p className="text-sm text-htg-fg-muted mb-4">{t('no_exceptions')}</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {exceptions.map(ex => (
              <div key={ex.id} className="flex items-center gap-2 bg-htg-surface rounded-lg px-3 py-1.5">
                <span className="text-sm font-medium text-htg-fg">{ex.exception_date}</span>
                <button onClick={() => deleteException(ex.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Data</label>
            <input type="date" value={newExDate} min={today} onChange={e => setNewExDate(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg" />
          </div>
          <button onClick={addException}
            className="flex items-center gap-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            <Plus className="w-4 h-4" /> Zablokuj dzień
          </button>
        </div>
      </div>
    </div>
  );
}
