'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, CalendarPlus, Lock, UserCheck, UserPlus, UserMinus, Clock } from 'lucide-react';
import { PreSessionGrafikSection } from '@/components/prowadzacy/PreSessionGrafikSection';
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
  const [specSoloOnly, setSpecSoloOnly] = useState(false);

  // Private slot form
  const [privDate, setPrivDate] = useState('');
  const [privStart, setPrivStart] = useState('10:00');
  const [privEmail, setPrivEmail] = useState('');
  const [privAssistant, setPrivAssistant] = useState<string>(''); // '' = solo, assistant_id = with assistant
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
  // Rules store is_active as boolean; we abuse end_time suffix to encode solo_only
  // Better: use metadata. For now, rules with end_time ending in ':01' = solo_only
  const getRulesForDay = (dayOfWeek: number) => {
    return rules
      .filter(r => r.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  // New: track pending add with type selection
  const [pendingAdd, setPendingAdd] = useState<{ day: number; time: string } | null>(null);

  const addRuleForDay = async (dayOfWeek: number, time: string, soloOnly: boolean = false) => {
    if (!time) return;
    const dayRules = getRulesForDay(dayOfWeek);
    if (dayRules.length >= MAX_SLOTS_PER_DAY) return;
    if (dayRules.some(r => r.start_time.slice(0, 5) === time)) return;
    const [h, m] = time.split(':').map(Number);
    const dur = soloOnly ? 120 : 120; // duration same, but we pass solo flag
    const endMin = h * 60 + m + dur;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: dayOfWeek, start_time: time, end_time: endTime, solo_only: soloOnly }),
    });
    setPendingAdd(null);
    fetchData();
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const isRuleSoloOnly = (rule: AvailabilityRule) => {
    return rule.solo_only === true;
  };

  // ── Specific date slot ──
  const addSpecificSlot = async () => {
    if (!specDate) return;
    const res = await fetch('/api/staff/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: specDate, start_time: specStart, solo_locked: specSoloOnly }),
    });
    if (res.ok) { setSpecDate(''); setSpecSoloOnly(false); fetchData(); }
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
        solo_locked: !privAssistant,
        assistant_id: privAssistant || null,
      }),
    });
    setPrivSaving(false);
    if (res.ok) { setPrivDate(''); setPrivEmail(''); setPrivAssistant(''); fetchData(); }
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
          Max 4 sesje dziennie. Wybierz godzinę i typ: <span className="text-htg-warm font-medium">1:1</span> = tylko Natalia, <span className="text-htg-sage font-medium">Otwarta</span> = operatorka może dołączyć.
        </p>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
            const dayRules = getRulesForDay(dayIdx);
            return (
              <div key={dayIdx} className="border border-htg-card-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-htg-fg mb-3">{t(DAY_KEYS[dayIdx])}</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {dayRules.map((rule, idx) => {
                    const solo = isRuleSoloOnly(rule);
                    return (
                      <div key={rule.id} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 border ${
                        solo
                          ? 'bg-htg-warm/10 border-htg-warm/30'
                          : 'bg-htg-sage/15 border-htg-sage/30'
                      }`}>
                        <span className="text-xs text-htg-fg-muted">Sesja {idx + 1}:</span>
                        <span className={`text-sm font-semibold ${solo ? 'text-htg-warm' : 'text-htg-sage'}`}>
                          {rule.start_time.slice(0, 5)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          solo ? 'bg-htg-warm/20 text-htg-warm' : 'bg-htg-sage/20 text-htg-sage'
                        }`}>
                          {solo ? '1:1' : 'Otwarta'}
                        </span>
                        <button onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-600 ml-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {/* Add new slot */}
                  {dayRules.length < MAX_SLOTS_PER_DAY && !pendingAdd && (
                    <select
                      defaultValue=""
                      onChange={e => {
                        if (e.target.value) {
                          setPendingAdd({ day: dayIdx, time: e.target.value });
                        }
                      }}
                      className="bg-htg-surface border border-htg-card-border rounded-lg px-2 py-2 text-sm text-htg-fg"
                    >
                      <option value="" disabled>+ dodaj</option>
                      {TIME_OPTIONS.filter(t => !dayRules.some(r => r.start_time.slice(0,5) === t)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                  {/* Type picker after selecting time */}
                  {pendingAdd?.day === dayIdx && (
                    <div className="flex items-center gap-1.5 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-htg-fg">{pendingAdd.time}</span>
                      <button
                        onClick={() => addRuleForDay(dayIdx, pendingAdd.time, true)}
                        className="px-2 py-1 rounded text-xs font-bold bg-htg-warm/20 text-htg-warm hover:bg-htg-warm/30 transition-colors"
                      >
                        1:1
                      </button>
                      <button
                        onClick={() => addRuleForDay(dayIdx, pendingAdd.time, false)}
                        className="px-2 py-1 rounded text-xs font-bold bg-htg-sage/20 text-htg-sage hover:bg-htg-sage/30 transition-colors"
                      >
                        Otwarta
                      </button>
                      <button onClick={() => setPendingAdd(null)} className="text-htg-fg-muted hover:text-htg-fg text-xs ml-1">✕</button>
                    </div>
                  )}
                  {dayRules.length === 0 && !pendingAdd && (
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
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Typ</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSpecSoloOnly(true)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  specSoloOnly ? 'bg-htg-warm text-white' : 'bg-htg-surface text-htg-fg-muted hover:bg-htg-warm/20'
                }`}
              >1:1</button>
              <button
                type="button"
                onClick={() => setSpecSoloOnly(false)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  !specSoloOnly ? 'bg-htg-sage text-white' : 'bg-htg-surface text-htg-fg-muted hover:bg-htg-sage/20'
                }`}
              >Otwarta</button>
            </div>
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
          <div>
            <label className="block text-xs text-htg-fg-muted mb-1">Sesja z</label>
            <select value={privAssistant} onChange={e => setPrivAssistant(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg">
              <option value="">Sama — 1:1 (2h)</option>
              {assistants.map(a => (
                <option key={a.id} value={a.id}>z {a.name} (1.5h)</option>
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

      {/* 5. Manage assistants on upcoming slots */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-2 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-htg-indigo" />
          Zarządzanie operatorkami
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Przypisz lub zmień operatorkę na nadchodzących terminach.
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
                  <th className="text-left py-2 px-3">Operatorka</th>
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
                        <option value="">Sama (1:1)</option>
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
interface AvailableSlotRow {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  effective_end_time?: string;
  available_operators?: { id: string; name: string; slug: string }[];
}

interface MyBookingRow {
  slot_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  slot_status: string;
  booking_id: string;
  booking_status: string;
  payment_status: string;
  topics: string | null;
  client_name: string;
  client_email: string | null;
}

const DAY_LABELS_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const DAY_LABELS_FULL_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

const ASSISTANT_TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    ASSISTANT_TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function AssistantEditor() {
  const t = useTranslations('Staff');
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Availability rules
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [savingRule, setSavingRule] = useState(false);
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('16:00');
  const [excDate, setExcDate] = useState('');
  const [excReason, setExcReason] = useState('');

  // Available-with-me slots
  const [availableWithMe, setAvailableWithMe] = useState<AvailableSlotRow[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Booked-with-me
  const [myBookings, setMyBookings] = useState<MyBookingRow[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const fetchRules = useCallback(async () => {
    const [rulesRes, excRes] = await Promise.all([
      fetch('/api/staff/availability').then(r => r.ok ? r.json() : { rules: [] }),
      fetch('/api/staff/exceptions').then(r => r.ok ? r.json() : { exceptions: [] }).catch(() => ({ exceptions: [] })),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(excRes.exceptions ?? []);
  }, []);

  const fetchAvailableWithMe = useCallback(async (staffId: string) => {
    setLoadingAvailable(true);
    const from = new Date().toISOString().slice(0, 10);
    const toDate = new Date(); toDate.setDate(toDate.getDate() + 28);
    const to = toDate.toISOString().slice(0, 10);
    const res = await fetch(`/api/booking/available-slots?session_type=natalia_asysta&locale=pl&from=${from}&to=${to}`);
    const data = res.ok ? await res.json() : { slots: [] };
    // Filter to slots where I appear in available_operators
    const filtered = (data.slots || []).filter((s: any) =>
      s.available_operators?.some((op: any) => op.id === staffId)
    );
    setAvailableWithMe(filtered);
    setLoadingAvailable(false);
  }, []);

  const fetchMyBookings = useCallback(async () => {
    setLoadingBookings(true);
    const res = await fetch('/api/staff/my-bookings');
    const data = res.ok ? await res.json() : { bookings: [] };
    setMyBookings(data.bookings ?? []);
    setLoadingBookings(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/staff/me')
      .then(r => r.ok ? r.json() : { staffMember: null })
      .then(data => {
        const id = data.staffMember?.id ?? null;
        setMyId(id);
        return Promise.all([fetchRules(), id ? fetchAvailableWithMe(id) : Promise.resolve(), fetchMyBookings()]);
      })
      .finally(() => setLoading(false));
  }, [fetchRules, fetchAvailableWithMe, fetchMyBookings]);

  const addRule = async () => {
    if (newStart >= newEnd) { alert('Godzina zakończenia musi być późniejsza niż rozpoczęcia.'); return; }
    setSavingRule(true);
    const res = await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: newDay, start_time: newStart, end_time: newEnd }),
    });
    setSavingRule(false);
    if (res.ok) fetchRules();
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Błąd zapisu'); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Usunąć tę regułę?')) return;
    setSavingRule(true);
    await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    setSavingRule(false);
    fetchRules();
  };

  const addException = async () => {
    if (!excDate) { alert('Wybierz datę.'); return; }
    setSavingRule(true);
    const res = await fetch('/api/staff/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exception_date: excDate, all_day: true, is_available: false, reason: excReason || null }),
    });
    setSavingRule(false);
    if (res.ok) { setExcDate(''); setExcReason(''); fetchRules(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Błąd'); }
  };

  const deleteException = async (id: string) => {
    setSavingRule(true);
    await fetch(`/api/staff/exceptions?id=${id}`, { method: 'DELETE' });
    setSavingRule(false);
    fetchRules();
  };

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return DAY_LABELS_PL[d.getDay()] + ' ' + dateStr.split('-')[2] + '.' + dateStr.split('-')[1];
  };

  if (loading) return <p className="text-htg-fg-muted">{t('loading')}</p>;

  const rulesByDay = DAY_LABELS_FULL_PL.map((label, dayOfWeek) => ({
    label,
    dayOfWeek,
    rules: rules.filter(r => r.day_of_week === dayOfWeek).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  return (
    <div className="space-y-8">
      {/* 1. Moje godziny — weekly availability rules */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-1 flex items-center gap-2">
          <Clock className="w-5 h-5 text-htg-sage" />
          Moje godziny
        </h3>
        <p className="text-sm text-htg-fg-muted mb-5">
          Ustaw przedziały, kiedy jesteś dostępna/y — strefa Europe/Warsaw. Klienci zobaczą tylko terminy Natalii pokrywające się z Twoją dostępnością.
        </p>

        {/* Day rules */}
        <div className="space-y-3 mb-6">
          {rulesByDay.map(({ label, dayOfWeek, rules: dayRules }) => (
            <div key={dayOfWeek} className="bg-htg-surface rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-htg-fg">{label}</span>
                {dayRules.length === 0 && <span className="text-xs text-htg-fg-muted">brak reguł</span>}
              </div>
              <div className="space-y-1">
                {dayRules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between bg-htg-card rounded px-3 py-1.5">
                    <span className="text-sm text-htg-fg">{rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}</span>
                    <button onClick={() => deleteRule(rule.id)} className="text-htg-fg-muted hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add rule form */}
        <div className="border-t border-htg-card-border pt-4">
          <p className="text-xs font-medium text-htg-fg-muted mb-3">Dodaj przedział dostępności:</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Dzień</label>
              <select
                value={newDay}
                onChange={e => setNewDay(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              >
                {DAY_LABELS_FULL_PL.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Od</label>
              <select
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              >
                {ASSISTANT_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Do</label>
              <select
                value={newEnd}
                onChange={e => setNewEnd(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              >
                {ASSISTANT_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button
              onClick={addRule}
              disabled={savingRule}
              className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Dodaj
            </button>
          </div>
        </div>

        {/* Exceptions */}
        {exceptions.length > 0 && (
          <div className="mt-5 border-t border-htg-card-border pt-4">
            <p className="text-xs font-medium text-htg-fg-muted mb-2">Dni wolne / wyjątki:</p>
            <div className="flex flex-wrap gap-2">
              {exceptions.map(ex => (
                <span key={ex.id} className="flex items-center gap-1 px-3 py-1 bg-htg-warm/10 text-htg-warm rounded-full text-xs">
                  {ex.exception_date} {ex.reason && `· ${ex.reason}`}
                  <button onClick={() => deleteException(ex.id)} className="ml-1 hover:text-red-500">✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Add exception */}
        <div className="mt-4 border-t border-htg-card-border pt-4">
          <p className="text-xs font-medium text-htg-fg-muted mb-3">Dodaj dzień wolny:</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Data</label>
              <input
                type="date"
                value={excDate}
                onChange={e => setExcDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              />
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Powód (opcj.)</label>
              <input
                type="text"
                value={excReason}
                onChange={e => setExcReason(e.target.value)}
                placeholder="np. urlop"
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
              />
            </div>
            <button
              onClick={addException}
              disabled={savingRule}
              className="flex items-center gap-2 px-4 py-2 bg-htg-warm/80 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CalendarPlus className="w-4 h-4" />
              Zablokuj
            </button>
          </div>
        </div>
      </div>

      {/* 2. Dostępne ze mną — slots where I appear as available operator */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-1 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-htg-sage" />
          Dostępne ze mną
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Terminy Natalii, w których jesteś dostępna/y i możesz zostać wybrany/a przez klienta.
        </p>

        {loadingAvailable ? (
          <p className="text-sm text-htg-fg-muted">Ładowanie...</p>
        ) : availableWithMe.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">
            Brak terminów w najbliższych 28 dniach. Upewnij się, że masz ustawione godziny dostępności powyżej.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableWithMe.map((slot) => (
              <div key={slot.id || `${slot.slot_date}-${slot.start_time}`} className="bg-htg-surface border border-htg-card-border rounded-lg p-3 text-center">
                <p className="text-xs text-htg-fg-muted">{formatDay(slot.slot_date)}</p>
                <p className="text-base font-bold text-htg-fg mt-1">{slot.start_time.slice(0, 5)}</p>
                <p className="text-xs text-htg-fg-muted">–{(slot.effective_end_time || slot.end_time).slice(0, 5)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Zarezerwowane ze mną */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-1 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-htg-warm" />
          Zarezerwowane ze mną
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Sesje, na które klienci zarezerwowali miejsce z Twoim udziałem.
        </p>

        {loadingBookings ? (
          <p className="text-sm text-htg-fg-muted">Ładowanie...</p>
        ) : myBookings.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">Brak sesji.</p>
        ) : (
          <div className="space-y-2">
            {myBookings.map(b => (
              <div key={b.booking_id} className={`flex items-center gap-4 p-4 rounded-xl border ${
                b.slot_date >= new Date().toISOString().slice(0, 10)
                  ? 'bg-htg-sage/5 border-htg-sage/30'
                  : 'bg-htg-card border-htg-card-border opacity-70'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {b.slot_date === new Date().toISOString().slice(0, 10) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                    )}
                    <span className="font-bold text-htg-fg text-sm">{b.slot_date}</span>
                    <span className="text-htg-fg text-sm">{b.start_time.slice(0, 5)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      b.booking_status === 'confirmed' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                      b.booking_status === 'completed' ? 'bg-htg-indigo/20 text-htg-indigo' :
                      'bg-htg-warm/20 text-htg-warm'
                    }`}>
                      {b.booking_status === 'confirmed' ? 'Potwierdzona' : b.booking_status === 'completed' ? 'Zakończona' : b.booking_status}
                    </span>
                  </div>
                  <p className="text-sm text-htg-fg-muted">{b.client_name}</p>
                  {b.topics && <p className="text-xs text-htg-fg-muted mt-0.5 line-clamp-1">📝 {b.topics}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Pre-session meetings */}
      <PreSessionGrafikSection />
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
