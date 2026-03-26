'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, CalendarPlus, Lock, UserCheck, UserPlus, UserMinus, Clock } from 'lucide-react';
import type { AvailabilityRule, AvailabilityException, StaffMember } from '@/lib/booking/types';
import { SESSION_CONFIG, CALENDAR_START_HOUR, CALENDAR_END_HOUR } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

// Generate time options every 15 minutes from CALENDAR_START_HOUR to CALENDAR_END_HOUR
const TIME_OPTIONS: string[] = [];
for (let h = CALENDAR_START_HOUR; h <= CALENDAR_END_HOUR; h++) {
  for (const m of [0, 15, 30, 45]) {
    if (h === CALENDAR_END_HOUR && m > 0) break;
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}
const MAX_SLOTS_PER_DAY = 4;

interface SlotData {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  status: string;
  is_extra: boolean;
  held_for_user: string | null;
  notes: string | null;
  assistant_id: string | null;
  assistant?: { id: string; name: string; slug: string; role: string } | null;
}

// ────────────────────────────────────────────
// Practitioner (Natalia) Schedule Editor
// ────────────────────────────────────────────
function PractitionerEditor() {
  const t = useTranslations('Staff');

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [assistants, setAssistants] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Specific date form
  const [specDate, setSpecDate] = useState('');
  const [specStart, setSpecStart] = useState('10:00');

  // Private slot form
  const [privDate, setPrivDate] = useState('');
  const [privStart, setPrivStart] = useState('10:00');
  const [privEmail, setPrivEmail] = useState('');
  const [privSaving, setPrivSaving] = useState(false);

  // Blocked date form
  const [newExDate, setNewExDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rulesRes, exRes, slotsRes, staffRes] = await Promise.all([
      fetch('/api/staff/availability').then(r => r.json()),
      fetch('/api/staff/exceptions').then(r => r.json()),
      fetch('/api/staff/slots').then(r => r.ok ? r.json() : { slots: [] }),
      fetch('/api/admin/staff').then(r => r.ok ? r.json() : { staff: [] }).catch(() => ({ staff: [] })),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(exRes.exceptions ?? []);
    setSlots(slotsRes.slots ?? []);
    setAssistants((staffRes.staff ?? []).filter((s: StaffMember) => s.role === 'assistant' && s.is_active));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Weekly rules: 4 slot selectors per day ──
  const getRulesForDay = (dayOfWeek: number) => {
    return rules
      .filter(r => r.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const addRuleForDay = async (dayOfWeek: number, time: string) => {
    if (!time) return;
    const dayRules = getRulesForDay(dayOfWeek);
    if (dayRules.length >= MAX_SLOTS_PER_DAY) return;
    // Check duplicate
    if (dayRules.some(r => r.start_time.slice(0, 5) === time)) return;
    const [h, m] = time.split(':').map(Number);
    const endMin = h * 60 + m + 120;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: dayOfWeek, start_time: time, end_time: endTime }),
    });
    fetchData();
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  // ── Specific date slot ──
  const addSpecificSlot = async () => {
    if (!specDate) return;
    const res = await fetch('/api/staff/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: specDate, start_time: specStart }),
    });
    if (res.ok) { setSpecDate(''); fetchData(); }
  };

  // ── Private slot ──
  const addPrivateSlot = async () => {
    if (!privDate || !privEmail) return;
    setPrivSaving(true);
    const res = await fetch('/api/staff/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: privDate,
        start_time: privStart,
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

  const deleteSlot = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    await fetch(`/api/staff/slots?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  // ── Change assistant on slot ──
  const changeAssistant = async (slotId: string, assistantId: string | null) => {
    await fetch('/api/staff/slots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: slotId, assistant_id: assistantId || null }),
    });
    fetchData();
  };

  const today = new Date().toISOString().split('T')[0];
  const publicSlots = slots.filter(s => !s.held_for_user);
  const privateSlots = slots.filter(s => s.held_for_user);

  if (loading) return <p className="text-htg-fg-muted">{t('loading')}</p>;

  return (
    <div className="space-y-8">
      {/* 1. Weekly schedule — time grid per day */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-htg-sage" />
          {t('weekly_schedule')}
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Max 4 sesje dziennie. Wybierz godzinę rozpoczęcia (co 15 min). Każdy termin = sesja solo 2h.
        </p>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
            const dayRules = getRulesForDay(dayIdx);
            return (
              <div key={dayIdx} className="border border-htg-card-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-htg-fg mb-3">{t(DAY_KEYS[dayIdx])}</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Active slots */}
                  {dayRules.map((rule, idx) => (
                    <div key={rule.id} className="flex items-center gap-1.5 bg-htg-sage/15 border border-htg-sage/30 rounded-lg px-3 py-2">
                      <span className="text-xs text-htg-fg-muted">Sesja {idx + 1}:</span>
                      <span className="text-sm font-semibold text-htg-sage">{rule.start_time.slice(0, 5)}</span>
                      <button onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-600 ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {/* Add slot button (if < 4) */}
                  {dayRules.length < MAX_SLOTS_PER_DAY && (
                    <div className="flex items-center gap-1.5">
                      <select
                        id={`day-${dayIdx}-new`}
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            addRuleForDay(dayIdx, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="bg-htg-surface border border-htg-card-border rounded-lg px-2 py-2 text-sm text-htg-fg"
                      >
                        <option value="" disabled>+ dodaj</option>
                        {TIME_OPTIONS.filter(t => !dayRules.some(r => r.start_time.slice(0,5) === t)).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {dayRules.length === 0 && (
                    <span className="text-xs text-htg-fg-muted italic">Brak terminów</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Specific date slots */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <CalendarPlus className="w-5 h-5 text-htg-sage" />
          Dodatkowe terminy
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">Dodaj konkretne daty dostępności (poza harmonogramem tygodniowym).</p>

        {publicSlots.length > 0 && (
          <div className="space-y-2 mb-4">
            {publicSlots.map(slot => (
              <div key={slot.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-htg-fg">{slot.slot_date}</span>
                  <span className="text-sm text-htg-fg-muted">{slot.start_time.slice(0,5)}&ndash;{slot.end_time.slice(0,5)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    SESSION_CONFIG[slot.session_type as SessionType]?.color ?? 'bg-htg-surface'
                  } text-white`}>
                    {SESSION_CONFIG[slot.session_type as SessionType]?.labelShort ?? slot.session_type}
                  </span>
                  {slot.assistant && (
                    <span className="text-xs text-htg-warm">{slot.assistant.name}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    slot.status === 'available' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                    slot.status === 'booked' ? 'bg-htg-indigo/20 text-htg-indigo' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>{slot.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  {slot.status === 'available' && (
                    <button onClick={() => deleteSlot(slot.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
            <label className="block text-xs text-htg-fg-muted mb-1">Godzina startu</label>
            <select value={specStart} onChange={e => setSpecStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={addSpecificSlot}
            className="flex items-center gap-1 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors">
            <CalendarPlus className="w-4 h-4" /> Dodaj termin
          </button>
        </div>
      </div>

      {/* 3. Private slot */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <Lock className="w-5 h-5 text-htg-warm" />
          Prywatny termin dla klienta
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Termin widoczny tylko dla konkretnego klienta (nie pojawi się w ogólnej puli).
        </p>

        {privateSlots.length > 0 && (
          <div className="space-y-2 mb-4">
            {privateSlots.map(slot => (
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
            <label className="block text-xs text-htg-fg-muted mb-1">Godzina startu</label>
            <select value={privStart} onChange={e => setPrivStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
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

      {/* 5. Manage assistants on upcoming slots */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-htg-indigo" />
          Zarządzanie asystentkami
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Przypisz lub zmień asystentkę na nadchodzących terminach.
        </p>

        {slots.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak nadchodzących terminów.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-htg-fg-muted text-xs uppercase border-b border-htg-card-border">
                  <th className="text-left py-2 px-3">Data</th>
                  <th className="text-left py-2 px-3">Godzina</th>
                  <th className="text-left py-2 px-3">Typ</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Asystentka</th>
                </tr>
              </thead>
              <tbody>
                {slots.map(slot => (
                  <tr key={slot.id} className="border-b border-htg-card-border/50">
                    <td className="py-2 px-3 text-htg-fg">{slot.slot_date}</td>
                    <td className="py-2 px-3 text-htg-fg">{slot.start_time.slice(0,5)}&ndash;{slot.end_time.slice(0,5)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        SESSION_CONFIG[slot.session_type as SessionType]?.color ?? 'bg-htg-surface'
                      } text-white`}>
                        {SESSION_CONFIG[slot.session_type as SessionType]?.labelShort ?? slot.session_type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        slot.status === 'available' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                        slot.status === 'booked' ? 'bg-htg-indigo/20 text-htg-indigo' :
                        slot.status === 'held' ? 'bg-htg-warm/20 text-htg-warm-text' :
                        'bg-htg-surface text-htg-fg-muted'
                      }`}>{slot.status}</span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={slot.assistant_id ?? ''}
                        onChange={e => changeAssistant(slot.id, e.target.value || null)}
                        className="bg-htg-surface border border-htg-card-border rounded-lg px-2 py-1 text-xs text-htg-fg"
                      >
                        <option value="">Solo (2h)</option>
                        {assistants.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Assistant Schedule Editor
// ────────────────────────────────────────────
function AssistantEditor() {
  const t = useTranslations('Staff');

  const [availableSlots, setAvailableSlots] = useState<SlotData[]>([]);
  const [mySlots, setMySlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/staff/slots');
    if (res.ok) {
      const data = await res.json();
      setAvailableSlots(data.availableSlots ?? []);
      setMySlots(data.mySlots ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const joinSlot = async (slotId: string) => {
    setActing(slotId);
    const res = await fetch('/api/staff/slots/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
    });
    setActing(null);
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || 'Błąd');
    }
  };

  const leaveSlot = async (slotId: string) => {
    if (!confirm('Czy na pewno chcesz opuścić ten termin?')) return;
    setActing(slotId);
    const res = await fetch('/api/staff/slots/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
    });
    setActing(null);
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || 'Błąd');
    }
  };

  if (loading) return <p className="text-htg-fg-muted">{t('loading')}</p>;

  return (
    <div className="space-y-8">
      {/* Available slots to join */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-htg-sage" />
          Dostępne terminy Natalii
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Terminy solo, do których możesz dołączyć jako asystentka.
        </p>

        {availableSlots.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak dostępnych terminów do dołączenia.</p>
        ) : (
          <div className="space-y-2">
            {availableSlots.map(slot => (
              <div key={slot.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-htg-fg">{slot.slot_date}</span>
                  <span className="text-sm text-htg-fg-muted">{slot.start_time.slice(0,5)}&ndash;{slot.end_time.slice(0,5)}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-htg-indigo text-white">
                    Solo (2h)
                  </span>
                </div>
                <button
                  onClick={() => joinSlot(slot.id)}
                  disabled={acting === slot.id}
                  className="flex items-center gap-1 bg-htg-sage text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {acting === slot.id ? 'Dołączanie...' : 'Dołącz'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My assigned slots */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-htg-warm" />
          Moje terminy
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Terminy, do których dołączyłaś jako asystentka.
        </p>

        {mySlots.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Nie masz jeszcze przypisanych terminów.</p>
        ) : (
          <div className="space-y-2">
            {mySlots.map(slot => (
              <div key={slot.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-4 py-3">
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
                    slot.status === 'held' ? 'bg-htg-warm/20 text-htg-warm-text' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>{slot.status}</span>
                </div>
                {slot.status !== 'booked' && (
                  <button
                    onClick={() => leaveSlot(slot.id)}
                    disabled={acting === slot.id}
                    className="flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    {acting === slot.id ? 'Opuszczanie...' : 'Opuść termin'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Main export: picks editor based on staff role
// ────────────────────────────────────────────
export default function StaffScheduleEditor() {
  const t = useTranslations('Staff');
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/staff/me')
      .then(r => r.json())
      .then(data => {
        setStaffMember(data.staffMember ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-htg-fg-muted">{t('loading')}</p>;

  if (!staffMember) {
    return <p className="text-htg-fg-muted">Brak przypisanego profilu prowadzącego.</p>;
  }

  if (staffMember.role === 'practitioner') {
    return <PractitionerEditor />;
  }

  return <AssistantEditor />;
}
