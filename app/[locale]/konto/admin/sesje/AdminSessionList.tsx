'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Calendar, CheckCircle, Download, ExternalLink, Plus, X, Loader2, UserCheck } from 'lucide-react';
import { PAYMENT_STATUS_LABELS } from '@/lib/booking/constants';

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const SESSION_TYPES_CONFIG = [
  { key: 'all',              label: 'Wszystkie',      short: 'Wszystkie', className: 'bg-htg-surface text-htg-fg border border-htg-card-border' },
  { key: 'natalia_solo',    label: 'Sesje 1:1',        short: '1:1',       className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  { key: 'natalia_asysta',  label: 'Sesje z Asystą',   short: 'Asysta',    className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
  { key: 'natalia_justyna', label: 'Sesje z Justyną',  short: 'Justyna',   className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  { key: 'natalia_agata',   label: 'Sesje z Agatą',    short: 'Agata',     className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  { key: 'natalia_para',    label: 'Sesje dla Par',    short: 'Para',      className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
] as const;

type TypeKey = typeof SESSION_TYPES_CONFIG[number]['key'];

const SESSION_TYPE_BADGE: Record<string, { className: string }> = {
  natalia_solo:    { className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  natalia_agata:   { className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  natalia_justyna: { className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  natalia_para:    { className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
  natalia_asysta:  { className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
};

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending_verification', label: 'Do potwierdzenia' },
  { value: 'confirmed_paid',       label: 'Opłacona' },
  { value: 'installments',         label: 'Raty' },
  { value: 'partial_payment',      label: 'Niepełna płatność' },
];

function getSlot(b: any) { return Array.isArray(b.slot) ? b.slot[0] : b.slot; }
function getClient(b: any) { return Array.isArray(b.client) ? b.client[0] : b.client; }

function TypeBadge({ type }: { type: string }) {
  const tb = SESSION_TYPE_BADGE[type];
  const label = SESSION_CONFIG[type as SessionType]?.labelShort || type;
  return tb
    ? <span className={`text-xs px-2 py-0.5 rounded-full ${tb.className}`}>{label}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">{type}</span>;
}

// ─── Create Session Modal ────────────────────────────────────────────────────
interface UserSuggestion { id: string; email: string; display_name: string | null; }

function CreateSessionModal({ locale, onCreated, onClose }: { locale: string; onCreated: () => void; onClose: () => void }) {
  const [userQuery, setUserQuery] = useState('');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sessionType, setSessionType] = useState<string>('natalia_solo');
  const [slotDate, setSlotDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [paymentStatus, setPaymentStatus] = useState('pending_verification');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
        setSuggestions(await res.json());
      } catch { setSuggestions([]); }
      finally { setLoadingSuggestions(false); }
    }, 250);
  }, []);

  function handleUserQuery(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setUserQuery(v);
    setSelectedUser(null);
    fetchSuggestions(v);
  }

  function selectUser(u: UserSuggestion) {
    setSelectedUser(u);
    setUserQuery(u.email);
    setSuggestions([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) { setError('Wybierz użytkownika z listy podpowiedzi.'); return; }
    if (!slotDate) { setError('Podaj datę sesji.'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/booking/create-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          sessionType,
          slotDate,
          startTime,
          paymentStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Błąd tworzenia sesji.'); return; }
      onCreated();
      onClose();
    } catch { setError('Błąd sieci.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-htg-card border border-htg-card-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif font-bold text-htg-fg">Nowa sesja</h2>
          <button onClick={onClose} className="text-htg-fg-muted hover:text-htg-fg"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-htg-fg">Klient</label>
            <div className="relative">
              <input
                type="email"
                value={userQuery}
                onChange={handleUserQuery}
                placeholder="Wpisz e-mail..."
                autoComplete="off"
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:ring-2 focus:ring-htg-indigo/40"
              />
              {loadingSuggestions && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-htg-fg-muted" />}
              {suggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-full bg-htg-card border border-htg-card-border rounded-lg shadow-lg z-10 overflow-hidden">
                  {suggestions.map(u => (
                    <button key={u.id} type="button" onMouseDown={e => { e.preventDefault(); selectUser(u); }}
                      className="w-full text-left px-3 py-2 hover:bg-htg-surface text-sm flex flex-col gap-0.5">
                      <span className="text-htg-fg">{u.email}</span>
                      {u.display_name && <span className="text-xs text-htg-fg-muted">{u.display_name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedUser && (
              <div className="flex items-center gap-1.5 text-xs text-htg-sage">
                <UserCheck className="w-3.5 h-3.5" />
                {selectedUser.display_name ? `${selectedUser.display_name} (${selectedUser.email})` : selectedUser.email}
              </div>
            )}
          </div>

          {/* Session type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-htg-fg">Typ sesji</label>
            <select value={sessionType} onChange={e => setSessionType(e.target.value)}
              className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40">
              {SESSION_TYPES_CONFIG.filter(t => t.key !== 'all').map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-htg-fg">Data</label>
              <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)} required
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-htg-fg">Godzina</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40" />
            </div>
          </div>

          {/* Payment status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-htg-fg">Status płatności</label>
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
              className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40">
              {PAYMENT_STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-htg-card-border text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors">
              Anuluj
            </button>
            <button type="submit" disabled={saving || !selectedUser || !slotDate}
              className="flex-1 py-2.5 rounded-lg bg-htg-indigo text-white text-sm font-medium hover:bg-htg-indigo/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Utwórz sesję
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AdminSessionList({
  bookings,
  todayStr,
  locale,
}: {
  bookings: any[];
  todayStr: string;
  locale: string;
}) {
  const router = useRouter();
  const [typeTab, setTypeTab] = useState<TypeKey>('all');
  const [statusTab, setStatusTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const q = search.toLowerCase().trim();

  // Filter by type
  const byType = typeTab === 'all' ? bookings : bookings.filter(b => b.session_type === typeTab);

  // Filter by date range (applied before upcoming/past split)
  const byDateRange = byType.filter(b => {
    const slot = getSlot(b);
    const d = slot?.slot_date || '';
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  // Split upcoming / past
  const upcoming = byDateRange.filter(b => {
    const slot = getSlot(b);
    return slot?.slot_date >= todayStr && b.status !== 'completed';
  });
  const past = byDateRange.filter(b => {
    const slot = getSlot(b);
    return slot?.slot_date < todayStr || b.status === 'completed';
  });

  const sortAsc = (a: any, b: any) => {
    const sa = getSlot(a); const sb = getSlot(b);
    return ((sa?.slot_date || '') + (sa?.start_time || '')).localeCompare((sb?.slot_date || '') + (sb?.start_time || ''));
  };
  const upcomingSorted = [...upcoming].sort(sortAsc);
  const pastSorted = [...past].sort((a, b) => -sortAsc(a, b));
  const current = statusTab === 'upcoming' ? upcomingSorted : pastSorted;

  const filtered = current.filter(b => {
    if (!q) return true;
    const client = getClient(b);
    return (client?.display_name || '').toLowerCase().includes(q)
      || (client?.email || '').toLowerCase().includes(q);
  });

  function countForType(key: TypeKey, which: 'upcoming' | 'past') {
    const base = key === 'all' ? bookings : bookings.filter(b => b.session_type === key);
    if (which === 'upcoming') return base.filter(b => { const s = getSlot(b); return s?.slot_date >= todayStr && b.status !== 'completed'; }).length;
    return base.filter(b => { const s = getSlot(b); return s?.slot_date < todayStr || b.status === 'completed'; }).length;
  }

  function exportPDF() {
    const rows = filtered.map(b => {
      const slot = getSlot(b);
      const client = getClient(b);
      const ps = PAYMENT_STATUS_BADGE[b.payment_status] || { label: '—' };
      return `<tr>
        <td>${slot?.slot_date || ''}</td>
        <td>${slot?.start_time?.slice(0, 5) || ''}</td>
        <td>${client?.display_name || client?.email || '—'}</td>
        <td>${client?.email || ''}</td>
        <td>${SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}</td>
        <td>${ps.label}</td>
      </tr>`;
    }).join('');

    const typeCfg = SESSION_TYPES_CONFIG.find(t => t.key === typeTab);
    const tabLabel = statusTab === 'upcoming' ? 'Nadchodzące' : 'Zakończone';
    const title = `${tabLabel} sesje — ${typeCfg?.label || 'Wszystkie'}${q ? ` — "${search}"` : ''}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
h1{font-size:18px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 12px;border-bottom:2px solid #333;font-weight:600}
td{padding:6px 12px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
@media print{body{padding:0}}</style></head>
<body><h1>${title}</h1>
<p>Wygenerowano: ${new Date().toLocaleDateString('pl-PL')} | Liczba sesji: ${filtered.length}</p>
<table><thead><tr><th>Data</th><th>Godzina</th><th>Klient</th><th>Email</th><th>Typ</th><th>Płatność</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  return (
    <div className="space-y-4">
      {/* Type tabs */}
      <div className="flex flex-wrap gap-2">
        {SESSION_TYPES_CONFIG.map(cfg => {
          const count = countForType(cfg.key, statusTab);
          const isActive = typeTab === cfg.key;
          return (
            <button key={cfg.key} onClick={() => setTypeTab(cfg.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                isActive
                  ? cfg.className + ' opacity-100 ring-2 ring-white/20'
                  : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-fg-muted/30'
              }`}>
              <span>{cfg.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-htg-card text-htg-fg-muted'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + date range + PDF + Add */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po imieniu lub emailu..."
              className="w-full pl-10 pr-8 py-2.5 bg-htg-card border border-htg-card-border rounded-xl text-sm text-htg-fg placeholder-htg-fg-muted focus:outline-none focus:ring-2 focus:ring-htg-sage/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-htg-fg-muted hover:text-htg-fg text-xs">✕</button>
            )}
          </div>
          <button onClick={exportPDF}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-htg-card border border-htg-card-border rounded-xl text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => setShowCreate(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/80 transition-colors">
            <Plus className="w-4 h-4" /> Dodaj sesję
          </button>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-htg-fg-muted shrink-0">Zakres dat:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 bg-htg-card border border-htg-card-border rounded-lg text-xs text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage/40" />
          <span className="text-xs text-htg-fg-muted">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 bg-htg-card border border-htg-card-border rounded-lg text-xs text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage/40" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-htg-fg-muted hover:text-htg-fg flex items-center gap-1">
              <X className="w-3 h-3" /> Wyczyść
            </button>
          )}
          {(dateFrom || dateTo) && (
            <span className="text-xs text-htg-sage ml-1">{filtered.length} sesji</span>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-htg-surface rounded-xl p-1">
        <button onClick={() => setStatusTab('upcoming')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            statusTab === 'upcoming' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}>
          <Calendar className="w-4 h-4" />
          Nadchodzące ({upcomingSorted.length})
        </button>
        <button onClick={() => setStatusTab('past')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            statusTab === 'past' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}>
          <CheckCircle className="w-4 h-4" />
          Zakończone ({pastSorted.length})
        </button>
      </div>

      {/* Session list */}
      {filtered.length === 0 ? (
        <p className="text-htg-fg-muted text-sm bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          {q ? 'Brak wyników wyszukiwania.' : (dateFrom || dateTo) ? 'Brak sesji w wybranym zakresie dat.' : statusTab === 'upcoming' ? 'Brak zaplanowanych sesji.' : 'Brak zakończonych sesji.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((b: any) => {
            const slot = getSlot(b);
            const client = getClient(b);
            const isToday = slot?.slot_date === todayStr;
            const ps = PAYMENT_STATUS_BADGE[b.payment_status] || { label: '—', className: 'bg-htg-surface text-htg-fg-muted' };

            return (
              <div key={b.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  isToday && statusTab === 'upcoming'
                    ? 'bg-htg-sage/5 border-htg-sage/30'
                    : 'bg-htg-card border-htg-card-border'
                } ${statusTab === 'past' ? 'opacity-70' : ''}`}>
                <Link href={`/${locale}/prowadzacy/sesje/${b.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isToday && statusTab === 'upcoming' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                    )}
                    <span className="font-bold text-htg-fg">{slot?.slot_date || '—'}</span>
                    <span className="text-htg-fg">{slot?.start_time?.slice(0, 5) || ''}</span>
                    {typeTab === 'all' && <TypeBadge type={b.session_type} />}
                  </div>
                  <p className="text-sm text-htg-fg-muted mt-0.5">
                    {client?.display_name || client?.email || '—'}
                    {client?.email && client?.display_name && (
                      <span className="text-xs ml-1 opacity-60">{client.email}</span>
                    )}
                  </p>
                  {b.topics && statusTab === 'upcoming' && (
                    <p className="text-xs text-htg-fg-muted mt-0.5 line-clamp-1">📝 {b.topics}</p>
                  )}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full ${ps.className}`}>{ps.label}</span>
                  <Link href={`/${locale}/konto/admin/uzytkownicy/${b.user_id}`}
                    className="p-1.5 rounded-lg text-htg-fg-muted hover:text-htg-indigo hover:bg-htg-indigo/10 transition-colors"
                    title="Profil klienta" onClick={e => e.stopPropagation()}>
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create session modal */}
      {showCreate && (
        <CreateSessionModal
          locale={locale}
          onCreated={() => router.refresh()}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
