'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';

const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const DAY_LABELS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

type Rule = {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type Exception = {
  id: string;
  staff_id: string;
  exception_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

export function TranslatorScheduleEditor({
  staffId: _staffId,
  staffName,
  localeCode,
}: {
  staffId: string;
  staffName: string;
  localeCode: string | null;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New rule form
  const [newDay, setNewDay] = useState(1); // Monday
  const [newStart, setNewStart] = useState('10:00');
  const [newEnd, setNewEnd] = useState('16:00');

  // New exception form
  const [excDate, setExcDate] = useState('');
  const [excReason, setExcReason] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [rulesRes, excRes] = await Promise.all([
      fetch('/api/staff/availability').then((r) => (r.ok ? r.json() : { rules: [] })),
      fetch('/api/staff/exceptions').then((r) =>
        r.ok ? r.json() : { exceptions: [] },
      ).catch(() => ({ exceptions: [] })),
    ]);
    setRules(rulesRes.rules ?? []);
    setExceptions(excRes.exceptions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addRule = async () => {
    if (newStart >= newEnd) {
      alert('Godzina zakończenia musi być późniejsza niż rozpoczęcia.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/staff/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day_of_week: newDay,
        start_time: newStart,
        end_time: newEnd,
      }),
    });
    setSaving(false);
    if (res.ok) {
      fetchAll();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Błąd zapisu reguły');
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Usunąć tę regułę dostępności?')) return;
    setSaving(true);
    const res = await fetch(`/api/staff/availability?id=${id}`, { method: 'DELETE' });
    setSaving(false);
    if (res.ok) fetchAll();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Błąd');
    }
  };

  const addException = async () => {
    if (!excDate) {
      alert('Wybierz datę.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/staff/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: excDate,
        reason: excReason || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setExcDate('');
      setExcReason('');
      fetchAll();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Błąd zapisu wyjątku');
    }
  };

  const deleteException = async (id: string) => {
    if (!confirm('Usunąć ten wyjątek?')) return;
    setSaving(true);
    const res = await fetch(`/api/staff/exceptions?id=${id}`, { method: 'DELETE' });
    setSaving(false);
    if (res.ok) fetchAll();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Błąd');
    }
  };

  // Group rules by day for display
  const rulesByDay = new Map<number, Rule[]>();
  for (const r of rules) {
    if (!rulesByDay.has(r.day_of_week)) rulesByDay.set(r.day_of_week, []);
    rulesByDay.get(r.day_of_week)!.push(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">
          Edycja grafiku — {staffName}
          {localeCode && (
            <span className="ml-2 text-sm text-htg-fg-muted">
              ({localeCode.toUpperCase()})
            </span>
          )}
        </h2>
      </div>

      <div className="text-sm text-htg-fg-muted bg-htg-surface/40 border border-htg-card-border rounded-lg p-3">
        Godziny podawaj w strefie <strong>Europe/Warsaw</strong> (czas polski). Twoja dostępność
        jest przecinana z dostępnością Natalii i operatorów — klient widzi terminy tylko gdy
        wszyscy jesteście wolni.
      </div>

      {/* Weekly rules */}
      <section className="bg-htg-card border border-htg-card-border rounded-xl p-5">
        <h3 className="font-serif font-bold text-htg-fg mb-4">Reguły tygodniowe</h3>

        {loading ? (
          <p className="text-htg-fg-muted text-sm">Ładowanie...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {DAY_LABELS.map((_, dow) => {
              const dayRules = rulesByDay.get(dow) || [];
              if (dayRules.length === 0) return null;
              return (
                <div key={dow} className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-sm text-htg-fg w-28 shrink-0">
                    {DAY_LABELS_FULL[dow]}
                  </span>
                  {dayRules.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-2 bg-htg-surface/50 border border-htg-card-border rounded-lg px-3 py-1 text-sm"
                    >
                      {r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}
                      <button
                        onClick={() => deleteRule(r.id)}
                        disabled={saving}
                        className="text-htg-fg-muted hover:text-red-600 transition-colors"
                        aria-label="Usuń regułę"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              );
            })}
            {rules.length === 0 && (
              <p className="text-sm text-htg-fg-muted">Brak reguł. Dodaj pierwszą poniżej.</p>
            )}
          </div>
        )}

        {/* Add rule */}
        <div className="flex flex-wrap gap-2 items-end pt-4 border-t border-htg-card-border">
          <label className="text-xs text-htg-fg-muted flex flex-col gap-1">
            Dzień
            <select
              value={newDay}
              onChange={(e) => setNewDay(Number(e.target.value))}
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-1 text-sm text-htg-fg"
            >
              {DAY_LABELS_FULL.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-htg-fg-muted flex flex-col gap-1">
            Od
            <select
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-1 text-sm text-htg-fg"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-htg-fg-muted flex flex-col gap-1">
            Do
            <select
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-1 text-sm text-htg-fg"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={addRule}
            disabled={saving}
            className="inline-flex items-center gap-1 bg-htg-indigo text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Dodaj regułę
          </button>
        </div>
      </section>

      {/* Exceptions */}
      <section className="bg-htg-card border border-htg-card-border rounded-xl p-5">
        <h3 className="font-serif font-bold text-htg-fg mb-4">Wyjątki (dni niedostępne)</h3>

        {loading ? (
          <p className="text-htg-fg-muted text-sm">Ładowanie...</p>
        ) : exceptions.length === 0 ? (
          <p className="text-sm text-htg-fg-muted mb-4">Brak wyjątków.</p>
        ) : (
          <div className="space-y-1 mb-4">
            {exceptions.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 bg-htg-surface/50 border border-htg-card-border rounded-lg px-3 py-2 text-sm"
              >
                <span className="font-semibold text-htg-fg">{e.exception_date}</span>
                {e.reason && <span className="text-htg-fg-muted">— {e.reason}</span>}
                <button
                  onClick={() => deleteException(e.id)}
                  disabled={saving}
                  className="ml-auto text-htg-fg-muted hover:text-red-600"
                  aria-label="Usuń wyjątek"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-end pt-4 border-t border-htg-card-border">
          <label className="text-xs text-htg-fg-muted flex flex-col gap-1">
            Data
            <input
              type="date"
              value={excDate}
              onChange={(e) => setExcDate(e.target.value)}
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-1 text-sm text-htg-fg"
            />
          </label>
          <label className="text-xs text-htg-fg-muted flex flex-col gap-1 flex-1 min-w-[180px]">
            Powód (opcjonalnie)
            <input
              type="text"
              value={excReason}
              onChange={(e) => setExcReason(e.target.value)}
              placeholder="np. urlop"
              className="bg-htg-surface border border-htg-card-border rounded px-2 py-1 text-sm text-htg-fg"
            />
          </label>
          <button
            onClick={addException}
            disabled={saving}
            className="inline-flex items-center gap-1 bg-htg-indigo text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Dodaj wyjątek
          </button>
        </div>
      </section>
    </div>
  );
}
