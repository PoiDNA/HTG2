'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Calendar, CheckCircle, Download, ExternalLink } from 'lucide-react';

const SESSION_TYPES_CONFIG = [
  { key: 'all',             label: 'Wszystkie',        short: 'Wszystkie', className: 'bg-htg-surface text-htg-fg border border-htg-card-border' },
  { key: 'natalia_solo',   label: 'Sesje 1:1',         short: '1:1',       className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  { key: 'natalia_asysta', label: 'Sesje z Asystą',    short: 'Asysta',    className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
  { key: 'natalia_justyna', label: 'Sesje z Justyną', short: 'Justyna',   className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  { key: 'natalia_agata',  label: 'Sesje z Agatą',     short: 'Agata',     className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  { key: 'natalia_para',   label: 'Sesje dla Par',     short: 'Para',      className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
] as const;

type TypeKey = typeof SESSION_TYPES_CONFIG[number]['key'];

const SESSION_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  natalia_solo:    { label: '1:1',     className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  natalia_agata:   { label: 'Agata',   className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  natalia_justyna: { label: 'Justyna', className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  natalia_para:    { label: 'Para',    className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
  natalia_asysta:  { label: 'Asysta',  className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:      { label: 'Opłacona',         className: 'bg-green-900/30 text-green-400' },
  installments:        { label: 'Raty',              className: 'bg-amber-900/30 text-amber-400' },
  partial_payment:     { label: 'Niepełna',          className: 'bg-orange-900/30 text-orange-400' },
  pending_verification:{ label: 'Do potwierdzenia', className: 'bg-yellow-900/30 text-yellow-400' },
};

function getSlot(b: any) { return Array.isArray(b.slot) ? b.slot[0] : b.slot; }
function getClient(b: any) { return Array.isArray(b.client) ? b.client[0] : b.client; }

function TypeBadge({ type }: { type: string }) {
  const tb = SESSION_TYPE_BADGE[type];
  return tb
    ? <span className={`text-xs px-2 py-0.5 rounded-full ${tb.className}`}>{tb.label}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">{type}</span>;
}

export default function AdminSessionList({
  bookings,
  todayStr,
  locale,
}: {
  bookings: any[];
  todayStr: string;
  locale: string;
}) {
  const [typeTab, setTypeTab] = useState<TypeKey>('all');
  const [statusTab, setStatusTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [deletedIds] = useState<Set<string>>(new Set());

  const q = search.toLowerCase().trim();

  // Filter by type
  const byType = typeTab === 'all'
    ? bookings
    : bookings.filter(b => b.session_type === typeTab);

  // Filter by upcoming / past
  const upcoming = byType.filter(b => {
    const slot = getSlot(b);
    return slot?.slot_date >= todayStr && b.status !== 'completed';
  });
  const past = byType.filter(b => {
    const slot = getSlot(b);
    return slot?.slot_date < todayStr || b.status === 'completed';
  });

  // Sort
  const sortAsc = (a: any, b: any) => {
    const sa = getSlot(a); const sb = getSlot(b);
    return ((sa?.slot_date || '') + (sa?.start_time || '')).localeCompare((sb?.slot_date || '') + (sb?.start_time || ''));
  };
  const upcomingSorted = [...upcoming].filter(b => !deletedIds.has(b.id)).sort(sortAsc);
  const pastSorted = [...past].filter(b => !deletedIds.has(b.id)).sort((a, b) => -sortAsc(a, b));
  const current = statusTab === 'upcoming' ? upcomingSorted : pastSorted;

  // Search
  const filtered = current.filter(b => {
    if (!q) return true;
    const client = getClient(b);
    return (client?.display_name || '').toLowerCase().includes(q)
      || (client?.email || '').toLowerCase().includes(q);
  });

  // Count per type (for tab badges)
  function countForType(key: TypeKey, which: 'upcoming' | 'past') {
    const base = key === 'all' ? bookings : bookings.filter(b => b.session_type === key);
    if (which === 'upcoming') return base.filter(b => { const s = getSlot(b); return s?.slot_date >= todayStr && b.status !== 'completed'; }).length;
    return base.filter(b => { const s = getSlot(b); return s?.slot_date < todayStr || b.status === 'completed'; }).length;
  }

  function exportPDF() {
    const rows = filtered.map(b => {
      const slot = getSlot(b);
      const client = getClient(b);
      const tb = SESSION_TYPE_BADGE[b.session_type];
      const ps = PAYMENT_STATUS_BADGE[b.payment_status] || { label: '—' };
      return `<tr>
        <td>${slot?.slot_date || ''}</td>
        <td>${slot?.start_time?.slice(0, 5) || ''}</td>
        <td>${client?.display_name || client?.email || '—'}</td>
        <td>${client?.email || ''}</td>
        <td>${tb?.label || b.session_type}</td>
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
            <button
              key={cfg.key}
              onClick={() => setTypeTab(cfg.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                isActive
                  ? cfg.className + ' opacity-100 ring-2 ring-white/20'
                  : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-fg-muted/30'
              }`}
            >
              <span>{cfg.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-htg-card text-htg-fg-muted'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + PDF */}
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
        <button
          onClick={exportPDF}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-htg-card border border-htg-card-border rounded-xl text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
        >
          <Download className="w-4 h-4" /> PDF
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-htg-surface rounded-xl p-1">
        <button
          onClick={() => setStatusTab('upcoming')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            statusTab === 'upcoming' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Nadchodzące ({upcomingSorted.length})
        </button>
        <button
          onClick={() => setStatusTab('past')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            statusTab === 'past' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Zakończone ({pastSorted.length})
        </button>
      </div>

      {/* Session list */}
      {filtered.length === 0 ? (
        <p className="text-htg-fg-muted text-sm bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          {q ? 'Brak wyników wyszukiwania.' : statusTab === 'upcoming' ? 'Brak zaplanowanych sesji.' : 'Brak zakończonych sesji.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((b: any) => {
            const slot = getSlot(b);
            const client = getClient(b);
            const isToday = slot?.slot_date === todayStr;
            const ps = PAYMENT_STATUS_BADGE[b.payment_status] || { label: '—', className: 'bg-htg-surface text-htg-fg-muted' };

            return (
              <div
                key={b.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  isToday && statusTab === 'upcoming'
                    ? 'bg-htg-sage/5 border-htg-sage/30'
                    : 'bg-htg-card border-htg-card-border'
                } ${statusTab === 'past' ? 'opacity-70' : ''}`}
              >
                {/* Main info — link to session detail */}
                <Link href={`/${locale}/prowadzacy/sesje/${b.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isToday && statusTab === 'upcoming' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                    )}
                    <span className="font-bold text-htg-fg">{slot?.slot_date || '—'}</span>
                    <span className="text-htg-fg">{slot?.start_time?.slice(0, 5) || ''}</span>
                    {/* Show type badge only in "Wszystkie" tab */}
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

                {/* Right side */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full ${ps.className}`}>{ps.label}</span>
                  {/* Link to user detail in admin */}
                  <Link
                    href={`/${locale}/konto/admin/uzytkownicy/${b.user_id}`}
                    className="p-1.5 rounded-lg text-htg-fg-muted hover:text-htg-indigo hover:bg-htg-indigo/10 transition-colors"
                    title="Profil klienta"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
