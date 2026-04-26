'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Plus, History, X, Save } from 'lucide-react';

export interface SesjaRow {
  id: string;
  user_id: string;
  session_type: string;
  status: string;
  session_date: string | null;
  start_time: string | null;
  topics: string | null;
  payment_notes: string | null;
  has_slot: boolean;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface AuditEntry {
  id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface Props {
  rows: SesjaRow[];
  isAdmin: boolean;
  currentUserEmail: string;
}

const STATUS_OPTIONS = ['pending_confirmation', 'confirmed', 'completed', 'cancelled', 'transferred'];

const SESSION_TYPES = [
  'natalia_solo',
  'natalia_agata',
  'natalia_justyna',
  'natalia_przemek',
  'pre_session',
  'natalia_para',
  'natalia_asysta',
  'natalia_interpreter_solo',
  'natalia_interpreter_asysta',
  'natalia_interpreter_para',
];

function formatDateTime(date: string | null, time: string | null): string {
  if (!date) return '—';
  const t = time ? time.slice(0, 5) : '';
  return `${date}${t ? ` ${t}` : ''}`;
}

export default function SesjePanelClient({ rows, isAdmin, currentUserEmail }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<SesjaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadAudit() {
    setError(null);
    try {
      const res = await fetch('/api/sesje/audit', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAudit(data.entries ?? []);
    } catch (e) {
      setError(`Nie udało się pobrać historii: ${(e as Error).message}`);
    }
  }

  function handleDelete(row: SesjaRow) {
    if (!confirm(`Usunąć sesję z ${formatDateTime(row.session_date, row.start_time)} (${row.email ?? '?'})? Tej operacji nie można cofnąć.`)) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/sesje/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Błąd usuwania: ${j.error ?? res.status}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-serif font-bold text-htg-fg">Panel sesji</h1>
          <p className="text-sm text-htg-fg-muted">
            Zalogowany jako <span className="font-mono">{currentUserEmail}</span>
            {isAdmin && <span className="ml-2 text-xs bg-htg-warm/20 text-htg-warm px-2 py-0.5 rounded">admin</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 bg-htg-sage text-white px-3 py-1.5 rounded-lg text-sm hover:bg-htg-sage/90"
          >
            <Plus className="w-4 h-4" /> Nowa sesja
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                const next = !showHistory;
                setShowHistory(next);
                if (next && audit === null) loadAudit();
              }}
              className="inline-flex items-center gap-1 border border-htg-card-border px-3 py-1.5 rounded-lg text-sm hover:bg-htg-surface"
            >
              <History className="w-4 h-4" /> Historia
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {showHistory && isAdmin && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Historia zmian</h2>
            <button onClick={() => setShowHistory(false)} className="text-htg-fg-muted hover:text-htg-fg">
              <X className="w-4 h-4" />
            </button>
          </div>
          {audit === null ? (
            <p className="text-sm text-htg-fg-muted">Ładowanie…</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-htg-fg-muted">Brak wpisów.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {audit.map(e => (
                <div key={e.id} className="text-xs border-b border-htg-card-border pb-2">
                  <div className="flex justify-between">
                    <span className="font-mono">{e.admin_email ?? e.admin_id.slice(0, 8)}</span>
                    <span className="text-htg-fg-muted">{new Date(e.created_at).toLocaleString('pl-PL')}</span>
                  </div>
                  <div className="text-htg-fg-muted">
                    <span className="font-bold">{e.action}</span>
                    {' '}
                    <span className="font-mono">{JSON.stringify(e.details)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-htg-surface text-left text-xs uppercase tracking-wide text-htg-fg-muted">
            <tr>
              <th className="px-3 py-2">Termin</th>
              <th className="px-3 py-2">Klient</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-htg-fg-muted">Brak sesji</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-htg-card-border">
                <td className="px-3 py-2 font-mono">{formatDateTime(r.session_date, r.start_time)}</td>
                <td className="px-3 py-2">{r.display_name ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.email ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.session_type}</td>
                <td className="px-3 py-2 text-xs">{r.status}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(r)}
                      className="p-1.5 text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface rounded"
                      title="Edytuj"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={pending}
                        className="p-1.5 text-htg-fg-muted hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Usuń (admin)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <SesjaForm
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

interface FormState {
  session_date: string;
  start_time: string;
  display_name: string;
  email: string;
  phone: string;
  session_type: string;
  status: string;
  topics: string;
  payment_notes: string;
}

function SesjaForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: SesjaRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const isCreate = !initial;
  const [form, setForm] = useState<FormState>({
    session_date: initial?.session_date ?? '',
    start_time: initial?.start_time?.slice(0, 5) ?? '',
    display_name: initial?.display_name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    session_type: initial?.session_type ?? 'natalia_solo',
    status: initial?.status ?? 'pending_confirmation',
    topics: initial?.topics ?? '',
    payment_notes: initial?.payment_notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const url = isCreate ? '/api/sesje/create' : `/api/sesje/${initial!.id}`;
      const method = isCreate ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      onError(`Błąd zapisu: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <form
        onSubmit={handleSave}
        className="bg-htg-card border border-htg-card-border rounded-xl p-6 w-full max-w-lg space-y-3 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-bold text-lg">{isCreate ? 'Nowa sesja' : 'Edycja sesji'}</h2>
          <button type="button" onClick={onClose} className="text-htg-fg-muted hover:text-htg-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Data
            <input
              type="date"
              value={form.session_date}
              onChange={e => set('session_date', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
            />
          </label>
          <label className="text-sm">
            Godzina
            <input
              type="time"
              value={form.start_time}
              onChange={e => set('start_time', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
            />
          </label>
        </div>

        <label className="text-sm block">
          Imię i nazwisko
          <input
            type="text"
            value={form.display_name}
            onChange={e => set('display_name', e.target.value)}
            className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Email
            <input
              type="email"
              required={isCreate}
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg font-mono"
            />
          </label>
          <label className="text-sm">
            Telefon
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg font-mono"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Typ sesji
            <select
              value={form.session_type}
              onChange={e => set('session_type', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
            >
              {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Status
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        <label className="text-sm block">
          Temat / notatki sesji
          <textarea
            value={form.topics}
            onChange={e => set('topics', e.target.value)}
            rows={2}
            className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
          />
        </label>

        <label className="text-sm block">
          Notatki płatności
          <textarea
            value={form.payment_notes}
            onChange={e => set('payment_notes', e.target.value)}
            rows={2}
            className="w-full mt-1 border border-htg-card-border rounded px-2 py-1 bg-white text-htg-fg"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-htg-card-border rounded hover:bg-htg-surface"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 bg-htg-sage text-white px-3 py-1.5 rounded text-sm hover:bg-htg-sage/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </form>
    </div>
  );
}
