'use client';

import { useState } from 'react';
import { CalendarClock, Check, X, Loader2, CalendarCheck, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n-config';

interface Props {
  bookingId: string;
  currentDate: string;       // current slot_date YYYY-MM-DD
  currentTime: string;       // current start_time HH:MM
  proposedDate: string | null;
  proposedTime: string | null;
  rescheduleStatus: string | null;
}

export default function RescheduleProposalEditor({
  bookingId,
  currentDate,
  currentTime,
  proposedDate: initialProposedDate,
  proposedTime: initialProposedTime,
  rescheduleStatus: initialStatus,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [proposedDate, setProposedDate] = useState(initialProposedDate);
  const [proposedTime, setProposedTime] = useState(initialProposedTime);

  const [showForm, setShowForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handlePropose() {
    if (!newDate || !newTime) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/reschedule-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_date: newDate, start_time: newTime }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProposedDate(newDate);
      setProposedTime(newTime);
      setStatus('pending');
      setShowForm(false);
      setNewDate('');
      setNewTime('');
      router.refresh();
    } catch (e: any) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAccept() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/reschedule-accept`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      setStatus(null);
      setProposedDate(null);
      setProposedTime(null);
      router.refresh();
    } catch (e: any) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/reschedule-proposal`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      setStatus(null);
      setProposedDate(null);
      setProposedTime(null);
      router.refresh();
    } catch (e: any) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
      <h2 className="text-base font-serif font-bold text-htg-fg flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-htg-warm" />
        Zmiana terminu
      </h2>

      {msg && (
        <p className="text-xs text-red-500">{msg}</p>
      )}

      {/* No pending proposal */}
      {status !== 'pending' && (
        <>
          <div className="text-sm text-htg-fg-muted">
            Aktualny termin: <span className="font-medium text-htg-fg">{currentDate} {currentTime}</span>
          </div>

          {!showForm ? (
            <button
              onClick={() => { setNewDate(''); setNewTime(currentTime); setShowForm(true); }}
              className="flex items-center gap-2 text-sm text-htg-warm hover:text-htg-warm/80 font-medium transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              Zaproponuj nowy termin
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-htg-fg-muted">Nowa data</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="px-3 py-1.5 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-htg-fg-muted">Nowa godzina</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="px-3 py-1.5 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-warm/40"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePropose}
                  disabled={!newDate || !newTime || saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-htg-warm text-white text-sm font-medium hover:bg-htg-warm/90 disabled:opacity-40 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Zaproponuj
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-fg"
                >
                  <X className="w-3.5 h-3.5" /> Anuluj
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pending proposal */}
      {status === 'pending' && proposedDate && (
        <div className="space-y-3">
          <div className="text-sm text-htg-fg-muted">
            Stary termin: <span className="font-medium text-htg-fg line-through opacity-60">{currentDate} {currentTime}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-300 dark:bg-amber-900/20 dark:border-amber-600">
            <CalendarCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Proponowany nowy termin</p>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{proposedDate} {proposedTime?.slice(0, 5)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAccept}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />}
              Zaakceptuj — przenieś sesję
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-htg-card-border text-sm text-htg-fg-muted hover:text-red-500 hover:border-red-400 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Usuń propozycję
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
