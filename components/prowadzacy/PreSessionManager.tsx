'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Video, ToggleLeft, ToggleRight, UserPlus, Trash2,
  CheckCircle, Clock, Calendar, Loader2, AlertCircle,
} from 'lucide-react';

interface Props {
  staffMember: { id: string; name: string; slug: string };
  settings: { is_enabled: boolean; note_for_client: string | null } | null;
  eligibility: Array<{
    id: string;
    user_id: string;
    is_active: boolean;
    meeting_booked: boolean;
    created_at: string;
    user: { email: string; display_name?: string } | null;
  }>;
  slots: Array<{
    id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
    client: { email: string; display_name?: string } | null;
  }>;
  locale: string;
}

export function PreSessionManager({ staffMember, settings, eligibility, slots, locale }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings?.is_enabled ?? false);
  const [note, setNote] = useState(settings?.note_for_client ?? '');
  const [toggling, setToggling] = useState(false);
  const [email, setEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [addError, setAddError] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState('');

  const today = new Date().toISOString().split('T')[0];

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
      router.refresh();
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
    router.refresh();
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
      router.refresh();
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
    router.refresh();
  }

  const activeEligibility = eligibility.filter(e => e.is_active);
  const booked = activeEligibility.filter(e => e.meeting_booked);
  const waiting = activeEligibility.filter(e => !e.meeting_booked);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Video className="w-6 h-6 text-purple-400" />
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Spotkania wstępne</h2>
          <p className="text-sm text-htg-fg-muted">Krótkie 15-minutowe spotkania online przed sesją</p>
        </div>
      </div>

      {/* Toggle ON/OFF */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-htg-fg">Funkcja aktywna</h3>
            <p className="text-sm text-htg-fg-muted mt-0.5">
              {enabled
                ? 'Klienci z aktywnymi rezerwacjami mogą umówić spotkanie wstępne'
                : 'Wyłączone — klienci nie widzą tej opcji'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all ${
              enabled
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg border border-htg-card-border'
            }`}
          >
            {toggling
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : enabled
                ? <ToggleRight className="w-5 h-5" />
                : <ToggleLeft className="w-5 h-5" />}
            {enabled ? 'Włączone' : 'Wyłączone'}
          </button>
        </div>

        {/* Optional note for clients */}
        <div className="mt-4 pt-4 border-t border-htg-card-border">
          <label className="text-sm font-medium text-htg-fg-muted block mb-1">
            Wiadomość dla klienta (opcjonalna)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="np. Przywitam Cię przed sesją i odpowiem na pytania wstępne"
              className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
            />
            <button
              onClick={handleToggle}
              className="px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
            >
              Zapisz
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Clients */}
        <div className="space-y-4">
          {/* Add client manually */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <h3 className="font-semibold text-htg-fg mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-purple-400" />
              Dodaj klienta ręcznie
            </h3>
            <form onSubmit={handleAddEmail} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@klienta.pl"
                required
                className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
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

          {/* Waiting to book */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <h3 className="font-semibold text-htg-fg mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              Oczekują na rezerwację ({waiting.length})
            </h3>
            {waiting.length === 0
              ? <p className="text-sm text-htg-fg-muted">Brak klientów oczekujących</p>
              : (
                <div className="space-y-2">
                  {waiting.map(e => (
                    <div key={e.id} className="flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-htg-fg truncate">{e.user?.display_name || e.user?.email || '—'}</p>
                        <p className="text-xs text-htg-fg-muted truncate">{e.user?.email}</p>
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

          {/* Already booked */}
          {booked.length > 0 && (
            <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 opacity-70">
              <h3 className="font-semibold text-htg-fg mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-htg-sage" />
                Zarezerwowane ({booked.length})
              </h3>
              <div className="space-y-2">
                {booked.map(e => (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-3.5 h-3.5 text-htg-sage shrink-0" />
                    <p className="text-htg-fg-muted truncate">{e.user?.display_name || e.user?.email || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Slots */}
        <div className="space-y-4">
          {/* Add slot */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <h3 className="font-semibold text-htg-fg mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              Dodaj termin (15 min)
            </h3>
            <form onSubmit={handleAddSlot} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  min={today}
                  required
                  className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  required
                  className="w-32 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
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

          {/* Upcoming slots */}
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <h3 className="font-semibold text-htg-fg mb-3">
              Nadchodzące terminy ({slots.length})
            </h3>
            {slots.length === 0
              ? (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-htg-fg-muted mx-auto mb-2 opacity-30" />
                  <p className="text-sm text-htg-fg-muted">Brak terminów — dodaj powyżej</p>
                </div>
              )
              : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {slots.map((s: any) => (
                    <div key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                      s.status === 'booked' ? 'bg-purple-900/20' : 'bg-htg-surface'
                    }`}>
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

      {/* Info box */}
      <div className="flex gap-3 p-4 bg-htg-surface rounded-xl border border-htg-card-border text-sm text-htg-fg-muted">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
        <p>
          Spotkania odbywają się w standardowym pokoju LiveKit (Faza 1 — max 15 min).
          Klient nie może samodzielnie odwołać ani przesunąć terminu.
          Gdy włączysz funkcję, system automatycznie doda uprawnienia do wszystkich klientów
          z potwierdzonymi rezerwacjami sesji.
        </p>
      </div>
    </div>
  );
}
