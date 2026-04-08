'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Calendar, CheckCircle, Download, Loader2, UserPlus } from 'lucide-react';
import { PAYMENT_STATUS_LABELS } from '@/lib/booking/constants';
import RowSessionPlayer from '@/components/recordings/RowSessionPlayer';
import AssignRecordingModal from '@/components/recordings/AssignRecordingModal';

const SessionReviewPlayer = dynamic(() => import('@/components/session-review/SessionReviewPlayer'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video bg-black flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
    </div>
  ),
});

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid:       { label: PAYMENT_STATUS_LABELS.confirmed_paid,       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments:         { label: PAYMENT_STATUS_LABELS.installments,         className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment:      { label: PAYMENT_STATUS_LABELS.partial_payment,      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: PAYMENT_STATUS_LABELS.pending_verification, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

const SESSION_TYPE_BADGE: Record<string, { className: string }> = {
  natalia_solo: { className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  natalia_agata: { className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  natalia_justyna: { className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  natalia_przemek: { className: 'bg-sky-900/40 text-sky-300 border border-sky-700/30' },
  natalia_para: { className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
  natalia_asysta: { className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
};

const TYPE_TABS = [
  { key: 'all',             label: 'Wszystkie',     className: 'bg-htg-surface text-htg-fg border border-htg-card-border' },
  { key: 'natalia_solo',   label: 'Sesje 1:1',      className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  { key: 'natalia_asysta', label: 'Sesje z Asystą', className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
  { key: 'natalia_justyna',label: 'Sesje z Justyną',className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  { key: 'natalia_agata',  label: 'Sesje z Agatą',  className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  { key: 'natalia_przemek',label: 'Sesje z Przemkiem', className: 'bg-sky-900/40 text-sky-300 border border-sky-700/30' },
  { key: 'natalia_para',   label: 'Sesje dla Par',  className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
] as const;

type TypeKey = typeof TYPE_TABS[number]['key'];

function getSlot(b: any) { return Array.isArray(b.slot) ? b.slot[0] : b.slot; }
function getClient(b: any) { return Array.isArray(b.client) ? b.client[0] : b.client; }

function TypeBadge({ type }: { type: string }) {
  const tb = SESSION_TYPE_BADGE[type];
  const label = SESSION_CONFIG[type as SessionType]?.labelShort || type;
  return tb
    ? <span className={`text-xs px-2 py-0.5 rounded-full ${tb.className}`}>{label}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">{type}</span>;
}

export default function SessionList({
  upcoming: initialUpcoming,
  past: initialPast,
  todayStr,
  locale,
  isPractitioner,
  userEmail,
  userId,
}: {
  upcoming: any[];
  past: any[];
  todayStr: string;
  locale: string;
  isPractitioner?: boolean;
  userEmail: string;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [typeTab, setTypeTab] = useState<TypeKey>('all');
  const [search, setSearch] = useState('');
  const [deletedIds] = useState<Set<string>>(new Set());
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [assignModalForRecordingId, setAssignModalForRecordingId] = useState<string | null>(null);
  const q = search.toLowerCase().trim();

  function matchesSearch(b: any) {
    if (!q) return true;
    const client = getClient(b);
    const name = (client?.display_name || '').toLowerCase();
    const email = (client?.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  }

  function matchesType(b: any) {
    return typeTab === 'all' || b.session_type === typeTab;
  }

  const upcoming = initialUpcoming.filter(b => !deletedIds.has(b.id));
  const past = initialPast.filter(b => !deletedIds.has(b.id));
  const filtered = (tab === 'upcoming' ? upcoming : past).filter(matchesType).filter(matchesSearch);

  function exportPDF() {
    const rows = filtered.map(b => {
      const slot = getSlot(b);
      const client = getClient(b);
      const ps = PAYMENT_STATUS_BADGE[b.payment_status] || PAYMENT_STATUS_BADGE.pending_verification;
      return `<tr>
        <td>${slot?.slot_date || ''}</td>
        <td>${slot?.start_time?.slice(0,5) || ''}</td>
        <td>${client?.display_name || client?.email || '—'}</td>
        <td>${client?.email || ''}</td>
        <td>${SESSION_CONFIG[b.session_type as SessionType]?.labelShort || b.session_type}</td>
        <td>${ps.label}</td>
      </tr>`;
    }).join('');

    const tabLabel = tab === 'upcoming' ? 'Nadchodzące' : 'Zakończone';
    const title = q ? `${tabLabel} sesje HTG — "${search}"` : `${tabLabel} sesje HTG`;
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

  function countForType(key: TypeKey, which: 'upcoming' | 'past') {
    const base = which === 'upcoming' ? upcoming : past;
    return key === 'all' ? base.length : base.filter(b => b.session_type === key).length;
  }

  return (
    <div className="space-y-4">
      {/* Type tabs — practitioner only */}
      {isPractitioner && (
        <div className="flex flex-wrap gap-2">
          {TYPE_TABS.map(cfg => {
            const count = countForType(cfg.key, tab);
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
      )}
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

      {/* Tabs */}
      <div className="flex gap-1 bg-htg-surface rounded-xl p-1">
        <button
          onClick={() => setTab('upcoming')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === 'upcoming'
              ? 'bg-htg-card text-htg-fg shadow-sm'
              : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Nadchodzące ({upcoming.length})
        </button>
        <button
          onClick={() => setTab('past')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === 'past'
              ? 'bg-htg-card text-htg-fg shadow-sm'
              : 'text-htg-fg-muted hover:text-htg-fg'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Zakończone ({past.length})
        </button>
      </div>

      {/* Session list */}
      {filtered.length === 0 ? (
        <p className="text-htg-fg-muted text-sm bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          {q ? 'Brak wyników wyszukiwania.' : tab === 'upcoming' ? 'Brak zaplanowanych sesji.' : 'Brak zakończonych sesji.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((b: any) => {
            const slot = getSlot(b);
            const client = getClient(b);
            const isToday = slot?.slot_date === todayStr;
            const ps = PAYMENT_STATUS_BADGE[b.payment_status] || PAYMENT_STATUS_BADGE.pending_verification;
            const hasRecording = tab === 'past' && !!b.readySesjaRecordingId;
            const isExpanded = expandedRecordingId === b.readySesjaRecordingId;

            return (
              <div key={b.id}>
                <div
                  className={`flex items-center gap-4 p-4 rounded-xl border hover:bg-htg-surface/50 transition-colors ${
                    isToday && tab === 'upcoming' ? 'bg-htg-sage/5 border-htg-sage/30' : 'bg-htg-card border-htg-card-border'
                  } ${tab === 'past' ? 'opacity-70' : ''}`}
                >
                  <Link href={`/${locale}/prowadzacy/sesje/${b.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isToday && tab === 'upcoming' && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>}
                      <span className="font-bold text-htg-fg">{slot?.slot_date}</span>
                      <span className="text-htg-fg">{slot?.start_time?.slice(0, 5)}</span>
                      {(!isPractitioner || typeTab === 'all') && <TypeBadge type={b.session_type} />}
                    </div>
                    <p className="text-sm text-htg-fg-muted mt-1">
                      {client?.display_name || client?.email || '—'}
                    </p>
                    {b.topics && tab === 'upcoming' && (
                      <p className="text-xs text-htg-fg-muted mt-1 line-clamp-1">📝 {b.topics}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full ${ps.className}`}>{ps.label}</span>
                    {hasRecording && (
                      <>
                        <RowSessionPlayer
                          isExpanded={isExpanded}
                          onToggle={() => setExpandedRecordingId(prev => prev === b.readySesjaRecordingId ? null : b.readySesjaRecordingId)}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setAssignModalForRecordingId(b.readySesjaRecordingId); }}
                          className="p-1.5 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
                          title="Przydziel nagranie"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {hasRecording && isExpanded && (
                  <div className="mt-1 rounded-xl overflow-hidden border border-htg-card-border bg-black">
                    <SessionReviewPlayer
                      playbackId={b.readySesjaRecordingId}
                      idFieldName="recordingId"
                      userEmail={userEmail}
                      userId={userId}
                      tokenEndpoint="/api/video/booking-recording-token"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign recording modal */}
      {assignModalForRecordingId && (
        <AssignRecordingModal
          recordingId={assignModalForRecordingId}
          onClose={() => setAssignModalForRecordingId(null)}
          onFinalChange={() => router.refresh()}
        />
      )}
    </div>
  );
}
