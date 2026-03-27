'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Video, ToggleLeft, ToggleRight, UserPlus, Trash2,
  CheckCircle, Clock, Calendar, Loader2, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

interface EligibilityEntry {
  id: string;
  user_id: string;
  is_active: boolean;
  meeting_booked: boolean;
  created_at: string;
  user: { email: string; display_name?: string } | null;
}

interface PreSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  client: { email: string; display_name?: string } | null;
}

export function PreSessionGrafikSection() {
  const router = useRouter();

  // Collapse state — domyślnie zwinięte
  const [expanded, setExpanded] = useState(false);

  // Data
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState('');
  const [eligibility, setEligibility] = useState<EligibilityEntry[]>([]);
  const [slots, setSlots] = useState<PreSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Forms
  const [toggling, setToggling] = useState(false);
  const [email, setEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [addError, setAddError] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, slotsRes] = await Promise.all([
        fetch('/api/pre-session/settings').then(r => r.ok ? r.json() : null),
        fetch('/api/pre-session/slots').then(r => r.ok ? r.json() : { slots: [] }),
      ]);
      if (settingsRes) {
        setEnabled(settingsRes.settings?.is_enabled ?? false);
        setNote(settingsRes.settings?.note_for_client ?? '');
      }
      // Fetch eligibility separately
      const eligRes = await fetch('/api/pre-session/eligibility').then(r => r.ok ? r.json() : { eligibility: [] });
      setEligibility(eligRes.eligibility ?? []);

      // Enrich slots with client names from eligibility data
      const rawSlots = slotsRes.slots ?? [];
      setSlots(rawSlots);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // Load data when section is expanded for the first time
  useEffect(() => {
    if (expanded && !loaded) {
      fetchData();
    }
  }, [expanded, loaded, fetchData]);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch('/api/pre-session/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !enabled, note_for_client: note || null }),
      });
      if (res.ok) {
        setEnabled(!enabled);
        router.refresh();
      }
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveNote() {
    setToggling(true);
    try {
      await fetch('/api/pre-session/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled, note_for_client: note || null }),
      });
      router.refresh();
    } finally {
      setToggling(false);
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    setAddingEmail(true);
    setAddError('');
    try {
      const res = await fetch('/api/pre-session/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setAddError(json.error || 'Błąd'); return; }
      setEmail('');
      fetchData();
    } finally {
      setAddingEmail(false);
    }
  }

  async function handleRevoke(eligibilityId: string) {
    await fetch('/api/pre-session/eligibility', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eligibilityId }),
    });
    fetchData();
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    setAddingSlot(true);
    setSlotError('');
    try {
      const res = await fetch('/api/pre-session/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, startTime: newTime }),
      });
      const json = await res.json();
      if (!res.ok) { setSlotError(json.error || 'Błąd'); return; }
      setNewDate('');
      setNewTime('');
      fetchData();
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    await fetch('/api/pre-session/slots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
    });
    fetchData();
  }

  const activeEligibility = eligibility.filter(e => e.is_active);
  const booked = activeEligibility.filter(e => e.meeting_booked);
  const waiting = activeEligibility.filter(e => !e.meeting_booked);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      {/* Header / toggle row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-htg-surface transition-colors"
      >
        <div className="flex items-center gap-3">
          <Video className="w-5 h-5 text-purple-400" />
          <div className="text-left">
            <p className="font-semibold text-htg-fg">Spotkania wstępne (15 min)</p>
            <p className="text-xs text-htg-fg-muted">
              {enabled ? 'Funkcja aktywna — klienci mogą rezerwować' : 'Wyłączone'}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-htg-fg-muted" />
          : <ChevronDown className="w-4 h-4 text-htg-fg-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-htg-card-border px-6 py-5 space-y-6">
          {loading && !loaded ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-htg-fg-muted" />
            </div>
          ) : (
            <>
              {/* Toggle + notatka */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    enabled
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg border border-htg-card-border'
                  }`}
                >
                  {toggling
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : enabled
                      ? <ToggleRight className="w-4 h-4" />
                      : <ToggleLeft className="w-4 h-4" />}
                  {enabled ? 'Włączone' : 'Wyłączone'}
                </button>
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Wiadomość dla klienta (opcjonalna)"
                    className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg min-w-0"
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={toggling}
                    className="px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg transition-colors shrink-0"
                  >
                    Zapisz
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lewa kolumna: klienci */}
                <div className="space-y-4">
                  {/* Dodaj klienta */}
                  <div className="bg-htg-surface rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-purple-400" />
                      Dodaj klienta ręcznie
                    </h4>
                    <form onSubmit={handleAddEmail} className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="email@klienta.pl"
                        required
                        className="flex-1 bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                      />
                      <button
                        type="submit"
                        disabled={addingEmail || !email}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        {addingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dodaj'}
                      </button>
                    </form>
                    {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
                  </div>

                  {/* Oczekują */}
                  <div className="bg-htg-surface rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-400" />
                      Oczekują na rezerwację ({waiting.length})
                    </h4>
                    {waiting.length === 0
                      ? <p className="text-sm text-htg-fg-muted">Brak</p>
                      : (
                        <div className="space-y-2">
                          {waiting.map(e => (
                            <div key={e.id} className="flex items-center gap-3 text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="text-htg-fg truncate">{e.user?.display_name || e.user?.email || '—'}</p>
                                {e.user?.display_name && (
                                  <p className="text-xs text-htg-fg-muted truncate">{e.user.email}</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleRevoke(e.id)}
                                className="p-1.5 rounded-lg hover:bg-red-900/20 text-htg-fg-muted hover:text-red-400 transition-colors"
                                title="Cofnij uprawnienie"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>

                  {/* Zarezerwowane */}
                  {booked.length > 0 && (
                    <div className="bg-htg-surface rounded-xl p-4 opacity-75">
                      <h4 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-htg-sage" />
                        Zarezerwowane ({booked.length})
                      </h4>
                      <div className="space-y-1.5">
                        {booked.map(e => (
                          <div key={e.id} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="w-3.5 h-3.5 text-htg-sage shrink-0" />
                            <p className="text-htg-fg-muted truncate">{e.user?.display_name || e.user?.email || '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Prawa kolumna: terminy */}
                <div className="space-y-4">
                  {/* Dodaj termin */}
                  <div className="bg-htg-surface rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-htg-fg mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      Dodaj termin (15 min)
                    </h4>
                    <form onSubmit={handleAddSlot} className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={newDate}
                          onChange={e => setNewDate(e.target.value)}
                          min={today}
                          required
                          className="flex-1 bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                        />
                        <input
                          type="time"
                          value={newTime}
                          onChange={e => setNewTime(e.target.value)}
                          required
                          className="w-28 bg-htg-card border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                        />
                        <button
                          type="submit"
                          disabled={addingSlot || !newDate || !newTime}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                          {addingSlot ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dodaj'}
                        </button>
                      </div>
                      {slotError && <p className="text-xs text-red-400">{slotError}</p>}
                    </form>
                  </div>

                  {/* Nadchodzące terminy */}
                  <div className="bg-htg-surface rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-htg-fg mb-3">
                      Nadchodzące terminy ({slots.length})
                    </h4>
                    {slots.length === 0 ? (
                      <div className="text-center py-4">
                        <Calendar className="w-7 h-7 text-htg-fg-muted mx-auto mb-2 opacity-30" />
                        <p className="text-sm text-htg-fg-muted">Brak terminów</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {slots.map((s: any) => (
                          <div
                            key={s.id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                              s.status === 'booked' ? 'bg-purple-900/20' : 'bg-htg-card'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-htg-fg font-medium">
                                  {new Date(s.slot_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', weekday: 'short' })}
                                </span>
                                <span className="text-htg-fg-muted">
                                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                </span>
                              </div>
                              {s.status === 'booked' && s.client && (
                                <p className="text-xs text-purple-400 mt-0.5 truncate">
                                  ✓ {s.client.display_name || s.client.email}
                                </p>
                              )}
                            </div>
                            {s.status === 'available' ? (
                              <button
                                onClick={() => handleDeleteSlot(s.id)}
                                className="p-1.5 rounded-lg hover:bg-red-900/20 text-htg-fg-muted hover:text-red-400 transition-colors"
                                title="Usuń termin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-xs text-purple-400 shrink-0">zarezerwowane</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="flex gap-3 p-3 bg-htg-surface rounded-xl text-xs text-htg-fg-muted">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
                <p>
                  Spotkania wstępne to 15-minutowe rozmowy online przed sesją klienta.
                  Klient nie może samodzielnie odwołać ani przesunąć terminu.
                  Gdy włączysz funkcję, istniejące rezerwacje klientów automatycznie otrzymują uprawnienia.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
