'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Calendar, CheckCircle, Mic } from 'lucide-react';

const SESSION_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  natalia_solo: { label: '1:1', className: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/30' },
  natalia_agata: { label: 'Agata', className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  natalia_justyna: { label: 'Justyna', className: 'bg-rose-900/40 text-rose-300 border border-rose-700/30' },
  natalia_para: { label: 'Para', className: 'bg-pink-900/40 text-pink-300 border border-pink-700/30' },
  natalia_asysta: { label: 'Asysta', className: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed_paid: { label: 'Opłacona', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  installments: { label: 'Raty', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  partial_payment: { label: 'Niepełna płatność', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  pending_verification: { label: 'Do potwierdzenia', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

function getSlot(b: any) { return Array.isArray(b.slot) ? b.slot[0] : b.slot; }
function getClient(b: any) { return Array.isArray(b.client) ? b.client[0] : b.client; }

function TypeBadge({ type }: { type: string }) {
  const tb = SESSION_TYPE_BADGE[type];
  return tb
    ? <span className={`text-xs px-2 py-0.5 rounded-full ${tb.className}`}>{tb.label}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">{type}</span>;
}

export default function SessionList({
  upcoming,
  past,
  todayStr,
  locale,
}: {
  upcoming: any[];
  past: any[];
  todayStr: string;
  locale: string;
}) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  function matchesSearch(b: any) {
    if (!q) return true;
    const client = getClient(b);
    const name = (client?.display_name || '').toLowerCase();
    const email = (client?.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  }

  const filteredUpcoming = upcoming.filter(matchesSearch);
  const filteredPast = past.filter(matchesSearch);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po imieniu lub emailu..."
          className="w-full pl-10 pr-4 py-2.5 bg-htg-card border border-htg-card-border rounded-xl text-sm text-htg-fg placeholder-htg-fg-muted focus:outline-none focus:ring-2 focus:ring-htg-sage/30"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-htg-fg-muted hover:text-htg-fg text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-htg-sage" />
          Nadchodzące ({filteredUpcoming.length}{q ? ` z ${upcoming.length}` : ''})
        </h3>

        {filteredUpcoming.length === 0 ? (
          <p className="text-htg-fg-muted text-sm bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
            {q ? 'Brak wyników wyszukiwania.' : 'Brak zaplanowanych sesji.'}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredUpcoming.map((b: any) => {
              const slot = getSlot(b);
              const client = getClient(b);
              const isToday = slot?.slot_date === todayStr;
              const ps = PAYMENT_STATUS_BADGE[b.payment_status] || PAYMENT_STATUS_BADGE.pending_verification;

              return (
                <Link key={b.id} href={`/${locale}/prowadzacy/sesje/${b.id}`} className="block">
                  <div className={`flex items-center gap-4 p-4 rounded-xl border hover:bg-htg-surface/50 transition-colors ${
                    isToday ? 'bg-htg-sage/5 border-htg-sage/30' : 'bg-htg-card border-htg-card-border'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>}
                        <span className="font-bold text-htg-fg">{slot?.slot_date}</span>
                        <span className="text-htg-fg">{slot?.start_time?.slice(0, 5)}</span>
                        <TypeBadge type={b.session_type} />
                      </div>
                      <p className="text-sm text-htg-fg-muted mt-1">
                        {client?.display_name || client?.email || '—'}
                      </p>
                      {b.topics && (
                        <p className="text-xs text-htg-fg-muted mt-1 line-clamp-2">📝 {b.topics}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full ${ps.className}`}>{ps.label}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Past */}
      {filteredPast.length > 0 && (
        <div>
          <h3 className="text-lg font-serif font-semibold text-htg-fg-muted mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-htg-fg-muted" />
            Zakończone ({filteredPast.length}{q ? ` z ${past.length}` : ''})
          </h3>
          <div className="space-y-2 opacity-70">
            {filteredPast.slice(0, q ? 50 : 20).map((b: any) => {
              const slot = getSlot(b);
              const client = getClient(b);
              return (
                <Link key={b.id} href={`/${locale}/prowadzacy/sesje/${b.id}`} className="block">
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-htg-card border border-htg-card-border hover:bg-htg-surface/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-htg-fg-muted">{slot?.slot_date}</span>
                        <span className="text-htg-fg-muted">{slot?.start_time?.slice(0, 5)}</span>
                        <TypeBadge type={b.session_type} />
                      </div>
                      <p className="text-xs text-htg-fg-muted">{client?.display_name || client?.email || '—'}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                      <CheckCircle className="w-3 h-3 inline mr-1" />Zakończona
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
