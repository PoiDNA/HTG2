'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, CalendarPlus, Users, UserCheck } from 'lucide-react';

const DAY_LABELS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

type Rule = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type Exception = {
  id: string;
  exception_date: string;
  reason: string | null;
};

type AvailableSlot = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
};

type MyBooking = {
  slot_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  booking_status: string;
  client_name: string;
  topics: string | null;
};

export function TranslatorGrafikManager({
  translatorLocale,
}: {
  translatorId: string;
  translatorName: string;
  translatorLocale: string;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [saving, setSaving] = useState(false);
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('16:00');
  const [excDate, setExcDate] = useState('');
  const [excReason, setExcReason] = useState('');

  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const fetchRules = useCallback(async () => {
    const [rulesRes, excRes] = await Promise.all([
      fetch('/api/staff/availability').then(r => r.ok ? r.json() : { rules: [] }),
      fetch('/api/staff/exceptions').then(r => r.ok ? r.json() : { exceptions: [] }).catch(() => ({ exceptions: [] })),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(excRes.exceptions ?? []);
  }, []);

  const fetchAvailableSlots = useCallback(async () => {
    setLoadingSlots(true);
    const from = new Date().toISOString().slice(0, 10);
    const toDate = new Date(); toDate.setDate(toDate.getDate() + 28);
    const to = toDate.toISOString().slice(0, 10);
    const res = await fetch(
      `/api/booking/available-slots?session_type=natalia_interpreter_solo&locale=${translatorLocale}&from=${from}&to=${to}`
    );
    const data = res.ok ? await res.json() : { slots: [] };
    setAvailableSlots(data.slots ?? []);
    setLoadingSlots(false);
  }, [translatorLocale]);

  const fetchMyBookings = useCallback(async () => {
    setLoadingBookings(true);
    const res = await fetch('/api/staff/my-bookings');
    const data = res.ok ? await res.json() : { bookings: [] };
    setMyBookings(data.bookings ?? []);
    setLoadingBookings(false);
  }, []);

  useEffect(() => {
    fetchRules();
    fetchAvailableSlots();
    fetchMyBookings();
  }, [fetchRules, fetchAvailableSlots, fetchMyBookings]);

  const addRule = async () => {
    if (newStart >= newEnd) { alert('Godzina zakończenia musi być późniejsza niż rozpoczęcia.'); return; }
    setSaving(true);
    const res = await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: newDay, start_time: newStart, end_time: newEnd }),
    });
    setSaving(false);
    if (res.ok) { fetchRules(); fetchAvailableSlots(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Błąd zapisu'); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Usunąć tę regułę?')) return;
    setSaving(true);
    await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    setSaving(false);
    fetchRules();
    fetchAvailableSlots();
  };

  const addException = async () => {
    if (!excDate) { alert('Wybierz datę.'); return; }
    setSaving(true);
    const res = await fetch('/api/staff/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: excDate, reason: excReason || null }),
    });
    setSaving(false);
    if (res.ok) { setExcDate(''); setExcReason(''); fetchRules(); fetchAvailableSlots(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Błąd'); }
  };

  const deleteException = async (id: string) => {
    setSaving(true);
    await fetch(`/api/staff/exceptions?id=${id}`, { method: 'DELETE' });
    setSaving(false);
    fetchRules();
    fetchAvailableSlots();
  };

  const rulesByDay = DAY_LABELS_FULL.map((label, dayOfWeek) => ({
    label,
    dayOfWeek,
    rules: rules.filter(r => r.day_of_week === dayOfWeek).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const names = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
    return `${names[d.getDay()]} ${dateStr.split('-')[2]}.${dateStr.split('-')[1]}`;
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      {/* 1. Moje godziny */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-1 flex items-center gap-2">
          <Clock className="w-5 h-5 text-htg-sage" />
          Moje godziny
        </h3>
        <p className="text-sm text-htg-fg-muted mb-5">
          Ustaw przedziały, kiedy jesteś dostępna/y — strefa Europe/Warsaw. Klienci zobaczą tylko
          terminy Natalii pokrywające się z Twoją dostępnością.
        </p>

        {/* Per-day rules */}
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
                    <span className="text-sm text-htg-fg">
                      {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                    </span>
                    <button onClick={() => deleteRule(rule.id)} className="text-htg-fg-muted hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add rule */}
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
                {DAY_LABELS_FULL.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Od</label>
              <select value={newStart} onChange={e => setNewStart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Do</label>
              <select value={newEnd} onChange={e => setNewEnd(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={addRule} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
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
              <input type="date" value={excDate} onChange={e => setExcDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40" />
            </div>
            <div>
              <label className="text-xs text-htg-fg-muted block mb-1">Powód (opcj.)</label>
              <input type="text" value={excReason} onChange={e => setExcReason(e.target.value)}
                placeholder="np. urlop"
                className="px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40" />
            </div>
            <button onClick={addException} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-htg-warm/80 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              <CalendarPlus className="w-4 h-4" />
              Zablokuj
            </button>
          </div>
        </div>
      </div>

      {/* 2. Dostępne ze mną */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h3 className="text-lg font-serif font-bold text-htg-fg mb-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-htg-sage" />
          Dostępne ze mną
        </h3>
        <p className="text-sm text-htg-fg-muted mb-4">
          Terminy Natalii w Twoim języku ({translatorLocale.toUpperCase()}), które pokrywają się z Twoją dostępnością — widoczne dla klientów.
        </p>

        {loadingSlots ? (
          <p className="text-sm text-htg-fg-muted">Ładowanie...</p>
        ) : availableSlots.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">
            Brak terminów w najbliższych 28 dniach. Upewnij się, że masz ustawione godziny dostępności powyżej.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableSlots.map((slot, i) => (
              <div key={slot.id || i} className={`bg-htg-surface border rounded-lg p-3 text-center ${
                slot.slot_date === todayStr ? 'border-htg-sage/50 bg-htg-sage/5' : 'border-htg-card-border'
              }`}>
                <p className="text-xs text-htg-fg-muted">{formatDay(slot.slot_date)}</p>
                <p className="text-base font-bold text-htg-fg mt-1">{slot.start_time.slice(0, 5)}</p>
                <p className="text-xs text-htg-fg-muted">–{slot.end_time.slice(0, 5)}</p>
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
            {myBookings.map((b, i) => (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border ${
                b.slot_date >= todayStr
                  ? 'bg-htg-sage/5 border-htg-sage/30'
                  : 'bg-htg-card border-htg-card-border opacity-70'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {b.slot_date === todayStr && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                    )}
                    <span className="font-bold text-htg-fg text-sm">{b.slot_date}</span>
                    <span className="text-htg-fg text-sm">{b.start_time.slice(0, 5)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      b.booking_status === 'confirmed' ? 'bg-htg-sage/20 text-htg-sage-dark' :
                      b.booking_status === 'completed' ? 'bg-htg-indigo/20 text-htg-indigo' :
                      'bg-htg-warm/20 text-htg-warm'
                    }`}>
                      {b.booking_status === 'confirmed' ? 'Potwierdzona'
                        : b.booking_status === 'completed' ? 'Zakończona'
                        : b.booking_status}
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
    </div>
  );
}
