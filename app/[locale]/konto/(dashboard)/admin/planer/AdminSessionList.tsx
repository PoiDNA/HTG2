'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Link, useRouter } from '@/i18n-config';
import { Search, Calendar, CheckCircle, Download, ExternalLink, Plus, X, Loader2, UserCheck, UserPlus, LayoutList, ChevronLeft, ChevronRight } from 'lucide-react';
import { isAdminEmail } from '@/lib/roles';
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

// Filter tabs (no interpreter types — 0 sessions)
const SESSION_FILTER_TABS = [
  { key: 'all',           label: 'Wszystkie',         short: 'Wszystkie', className: 'bg-htg-surface text-htg-fg border border-htg-card-border' },
  { key: 'natalia_solo',  label: 'Sesje 1:1',          short: '1:1',       className: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { key: 'natalia_asysta',label: 'Sesje z Asystą',     short: 'Asysta',    className: 'bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'natalia_justyna',label:'Sesje z Justyną',    short: 'Justyna',   className: 'bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300' },
  { key: 'natalia_agata', label: 'Sesje z Agatą',      short: 'Agata',     className: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'natalia_przemek',label:'Sesje z Operatorem', short: 'Operator',  className: 'bg-sky-200 text-sky-900 dark:bg-sky-900/40 dark:text-sky-300' },
  { key: 'natalia_para',  label: 'Sesje dla Par',      short: 'Para',      className: 'bg-pink-200 text-pink-900 dark:bg-pink-900/40 dark:text-pink-300' },
] as const;

// Full list for create modal
const ALL_SESSION_TYPE_OPTIONS = [
  { key: 'natalia_solo',    label: 'Sesja 1:1 z Natalią' },
  { key: 'natalia_asysta',  label: 'Sesja z Asystą (nieprzypisana)' },
  { key: 'natalia_agata',   label: 'Sesja z Natalią i Agatą' },
  { key: 'natalia_justyna', label: 'Sesja z Natalią i Justyną' },
  { key: 'natalia_przemek', label: 'Sesja z Operatorem' },
  { key: 'natalia_para',    label: 'Sesja dla par' },
] as const;

type FilterKey = typeof SESSION_FILTER_TABS[number]['key'];

const SESSION_TYPE_BADGE: Record<string, { className: string }> = {
  natalia_solo:               { className: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-300' },
  natalia_agata:              { className: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300' },
  natalia_justyna:            { className: 'bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300' },
  natalia_przemek:            { className: 'bg-sky-200 text-sky-900 dark:bg-sky-900/40 dark:text-sky-300' },
  natalia_para:               { className: 'bg-pink-200 text-pink-900 dark:bg-pink-900/40 dark:text-pink-300' },
  natalia_asysta:             { className: 'bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300' },
  natalia_interpreter_solo:   { className: 'bg-violet-200 text-violet-900 dark:bg-violet-900/40 dark:text-violet-300' },
  natalia_interpreter_asysta: { className: 'bg-violet-200 text-violet-900 dark:bg-violet-900/40 dark:text-violet-300' },
  natalia_interpreter_para:   { className: 'bg-violet-200 text-violet-900 dark:bg-violet-900/40 dark:text-violet-300' },
};

const INTERPRETER_TYPES = new Set(['natalia_interpreter_solo', 'natalia_interpreter_asysta', 'natalia_interpreter_para']);

// Maps logged-in staff email → their "own" session type key
const EMAIL_TO_OWN_SESSION: Partial<Record<string, FilterKey>> = {
  'agata@htg.cyou':    'natalia_agata',
  'justyna@htg.cyou':  'natalia_justyna',
  'operator@htg.cyou': 'natalia_przemek',
};

import { translators } from '@/lib/staff-config';
const TRANSLATORS = translators.map(t => ({
  slug: t.slug,
  name: `${t.name} (${t.locale.toUpperCase()})`,
  locale: t.locale,
}));

const DAY_NAMES_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
function getDayShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES_SHORT[d.getDay()] || '';
}

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

// ─── Month Calendar View ─────────────────────────────────────────────────────
const MONTH_NAMES_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAY_HEADERS = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];

function MonthCalendar({ bookings, monthKey, onMonthChange, locale, todayStr }: {
  bookings: any[];
  monthKey: string;
  onMonthChange: (m: string) => void;
  locale: string;
  todayStr: string;
}) {
  const [year, month] = monthKey.split('-').map(Number);

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Mon-first: getDay() 0=Sun→6, 1=Mon→0, …
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  // Group by date
  const byDate: Record<string, any[]> = {};
  for (const b of bookings) {
    const slot = getSlot(b);
    const d = slot?.slot_date;
    if (d?.startsWith(monthKey)) {
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(b);
    }
  }
  for (const d in byDate) {
    byDate[d].sort((a: any, b: any) =>
      (getSlot(a)?.start_time || '').localeCompare(getSlot(b)?.start_time || '')
    );
  }

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const d = new Date(year, month, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-base font-serif font-bold text-htg-fg">
          {MONTH_NAMES_PL[month - 1]} {year}
        </h3>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-htg-fg-muted py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startDow + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={i} className="min-h-20 rounded-lg" />;
          }
          const dateStr = `${monthKey}-${String(dayNum).padStart(2, '0')}`;
          const sessions = byDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          const isLowIntensity = dateStr >= '2025-07-11' && dateStr <= '2025-07-19';

          return (
            <div key={i} className={`min-h-20 p-1 rounded-lg border text-xs overflow-hidden ${
              isToday
                ? 'border-htg-sage/50 bg-htg-sage/5'
                : isLowIntensity
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                  : 'border-htg-card-border bg-htg-card/40'
            }`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full mb-1 font-bold text-xs ${
                isToday ? 'bg-htg-sage text-white' : isLowIntensity ? 'text-green-700 dark:text-green-400' : 'text-htg-fg-muted'
              }`}>{dayNum}</div>
              <div className="space-y-0.5">
                {sessions.map((b: any) => {
                  const slot = getSlot(b);
                  const client = getClient(b);
                  const tb = SESSION_TYPE_BADGE[b.session_type];
                  const isGhost = !!b._isGhost;
                  const isPendingReschedule = !isGhost && b.reschedule_status === 'pending';
                  const linkId = b._originalId || b.id;
                  return (
                    <Link
                      key={isGhost ? `ghost-${b._originalId}` : b.id}
                      href={{ pathname: '/konto/admin/planer/[id]', params: { id: linkId } }}
                      className={`block p-1 rounded cursor-pointer hover:opacity-75 transition-opacity ${
                        isGhost
                          ? 'border-2 border-dashed border-htg-fg bg-htg-card'
                          : isPendingReschedule
                            ? 'bg-black text-white border-2 border-black'
                            : (tb?.className || 'bg-htg-surface text-htg-fg-muted')
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-1">
                        {slot?.start_time?.slice(0, 5)}
                        {isGhost && <span className="text-xs font-bold">nowy</span>}
                        {!isGhost && b.created_by_email === 'agata@htg.cyou' && <span className="text-xs font-bold">(A)</span>}
                      </div>
                      <div className="truncate">{client?.display_name || client?.email || '—'}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Month summary */}
      {(() => {
        const total = Object.values(byDate).reduce((s, arr) => s + arr.length, 0);
        return total > 0 ? (
          <p className="text-xs text-htg-fg-muted text-right">{total} sesji w tym miesiącu</p>
        ) : (
          <p className="text-xs text-htg-fg-muted text-center py-4">Brak sesji w tym miesiącu.</p>
        );
      })()}
    </div>
  );
}

// ─── Create Session Modal ────────────────────────────────────────────────────
interface UserSuggestion { id: string; email: string; display_name: string | null; }

function CreateSessionModal({ locale, onCreated, onClose }: { locale: string; onCreated: () => void; onClose: () => void }) {
  const [userQuery, setUserQuery] = useState('');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sessionType, setSessionType] = useState<string>('natalia_solo');
  const [translatorSlug, setTranslatorSlug] = useState<string>('melania');
  const [slotDate, setSlotDate] = useState(() => {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  });
  const [startTime, setStartTime] = useState('09:00');
  const [paymentStatus, setPaymentStatus] = useState('pending_verification');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInterpreter = INTERPRETER_TYPES.has(sessionType);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = Array.isArray(data) ? data : [];
        setSuggestions(results);
        const exact = results.find((u: UserSuggestion) => u.email.toLowerCase() === q.toLowerCase());
        if (exact) { setSelectedUser(exact); setSuggestions([]); }
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

  async function handleSubmit() {
    if (!slotDate) { setError('Podaj datę sesji.'); return; }
    setError('');
    setSaving(true);

    let userId = selectedUser?.id;
    if (!userId && userQuery.includes('@')) {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(userQuery.trim())}`);
        const data = await res.json();
        const exact = Array.isArray(data) ? data.find((u: UserSuggestion) => u.email.toLowerCase() === userQuery.toLowerCase().trim()) : null;
        if (exact) { userId = exact.id; setSelectedUser(exact); }
        else { setSaving(false); setError('Nie znaleziono użytkownika z tym adresem e-mail.'); return; }
      } catch { setSaving(false); setError('Błąd wyszukiwania użytkownika.'); return; }
    }
    if (!userId) { setSaving(false); setError('Wpisz e-mail użytkownika.'); return; }

    try {
      const res = await fetch('/api/admin/booking/create-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionType, slotDate, startTime, paymentStatus, ...(isInterpreter && { translatorSlug }) }),
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

        <div className="space-y-4">
          {/* User */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-htg-fg">Klient</label>
            <div className="relative">
              <input type="text" value={userQuery} onChange={handleUserQuery} placeholder="Wpisz e-mail..."
                autoComplete="off"
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:ring-2 focus:ring-htg-indigo/40" />
              {loadingSuggestions && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-htg-fg-muted" />}
              {suggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-full bg-htg-card border border-htg-card-border rounded-lg shadow-lg z-10 overflow-hidden">
                  {suggestions.map(u => (
                    <button key={u.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectUser(u)}
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
              {ALL_SESSION_TYPE_OPTIONS.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Translator — only for interpreter types */}
          {isInterpreter && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-htg-fg">Tłumacz</label>
              <select value={translatorSlug} onChange={e => setTranslatorSlug(e.target.value)}
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40">
                {TRANSLATORS.map(tr => (
                  <option key={tr.slug} value={tr.slug}>{tr.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-htg-fg">Data</label>
              <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)}
                className="w-full px-3 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-indigo/40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-htg-fg">Godzina</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
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
            <button type="button" onClick={handleSubmit} disabled={saving || !userQuery.trim() || !slotDate}
              className="flex-1 py-2.5 rounded-lg bg-htg-indigo text-white text-sm font-medium hover:bg-htg-indigo/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Utwórz sesję
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AdminSessionList({
  bookings,
  todayStr,
  locale,
  adminUserEmail,
  adminUserId,
}: {
  bookings: any[];
  todayStr: string;
  locale: string;
  adminUserEmail: string;
  adminUserId: string;
}) {
  const router = useRouter();
  const isAdmin = isAdminEmail(adminUserEmail);
  const mySessionKey = EMAIL_TO_OWN_SESSION[adminUserEmail] ?? null;
  const [typeTab, setTypeTab] = useState<FilterKey>('all');
  const [showOtherTabs, setShowOtherTabs] = useState(false);
  const [statusTab, setStatusTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [assignModalForRecordingId, setAssignModalForRecordingId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Restore view/month from sessionStorage on mount
  useEffect(() => {
    try {
      const savedView = sessionStorage.getItem('sesje-view') as 'list' | 'calendar' | null;
      const savedMonth = sessionStorage.getItem('sesje-month');
      if (savedView) setView(savedView);
      if (savedMonth) setCalendarMonth(savedMonth);
    } catch {}
  }, []);

  // Persist view/month to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('sesje-view', view);
      sessionStorage.setItem('sesje-month', calendarMonth);
    } catch {}
  }, [view, calendarMonth]);

  const q = search.toLowerCase().trim();

  // Build ghost entries for pending reschedule proposals
  const bookingsWithGhosts = (() => {
    const ghosts: any[] = [];
    for (const b of bookings) {
      if (b.reschedule_status === 'pending' && b.proposed_slot_date) {
        ghosts.push({
          ...b,
          _isGhost: true,
          _originalId: b.id,
          slot: [{ slot_date: b.proposed_slot_date, start_time: b.proposed_start_time || '09:00:00', end_time: null }],
        });
      }
    }
    return [...bookings, ...ghosts];
  })();

  // Filter by type (ghosts inherit session_type from original, exclude from counts)
  const byType = typeTab === 'all' ? bookingsWithGhosts : bookingsWithGhosts.filter(b => b.session_type === typeTab);

  // Filter by search (used in both views)
  const bySearch = byType.filter(b => {
    if (!q) return true;
    const client = getClient(b);
    return (client?.display_name || '').toLowerCase().includes(q)
      || (client?.email || '').toLowerCase().includes(q);
  });

  // List view filters
  const byDateRange = bySearch.filter(b => {
    const slot = getSlot(b);
    const d = slot?.slot_date || '';
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

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

  function countForType(key: FilterKey, which: 'upcoming' | 'past') {
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

    const typeCfg = SESSION_FILTER_TABS.find(t => t.key === typeTab);
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

      {/* Type tabs */}
      {(() => {
        const primaryTabs = mySessionKey
          ? [SESSION_FILTER_TABS[0], ...SESSION_FILTER_TABS.filter(t => t.key === mySessionKey)]
          : SESSION_FILTER_TABS;
        const otherTabs = mySessionKey
          ? SESSION_FILTER_TABS.filter(t => t.key !== 'all' && t.key !== mySessionKey)
          : [];
        const otherActiveCount = otherTabs.reduce((sum, t) => sum + countForType(t.key, statusTab), 0);

        return (
          <div className="flex flex-wrap gap-2">
            {primaryTabs.map(cfg => {
              const count = countForType(cfg.key, statusTab);
              const isActive = typeTab === cfg.key;
              return (
                <button key={cfg.key} onClick={() => setTypeTab(cfg.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                    isActive
                      ? cfg.className + ' opacity-100 ring-2 ring-white/20'
                      : 'bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg hover:border-htg-fg-muted/30'
                  }`}>
                  <span>{cfg.label}{cfg.key === mySessionKey ? ' ★' : ''}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-htg-card text-htg-fg-muted'
                  }`}>{count}</span>
                </button>
              );
            })}

            {/* Other tabs — collapsed by default when user has own key */}
            {otherTabs.length > 0 && (
              <>
                {showOtherTabs && otherTabs.map(cfg => {
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
                <button
                  onClick={() => setShowOtherTabs(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium border bg-htg-surface border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  {showOtherTabs ? '▴ mniej' : `▾ inne (${otherActiveCount})`}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Search + PDF + Add + View toggle */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 items-center">
          {/* View toggle */}
          <div className="shrink-0 flex items-center gap-0.5 bg-htg-surface rounded-xl p-1 border border-htg-card-border">
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'}`}
              title="Widok listy"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`p-2 rounded-lg transition-colors ${view === 'calendar' ? 'bg-htg-card text-htg-fg shadow-sm' : 'text-htg-fg-muted hover:text-htg-fg'}`}
              title="Widok kalendarza"
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>

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

          {isAdmin && (
            <button onClick={exportPDF}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-htg-card border border-htg-card-border rounded-xl text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors">
              <Download className="w-4 h-4" /> PDF
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo/80 transition-colors">
            <Plus className="w-4 h-4" /> Dodaj sesję
          </button>
        </div>

        {/* Date range filter — list view only */}
        {view === 'list' && (
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
        )}
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
          <MonthCalendar
            bookings={bySearch}
            monthKey={calendarMonth}
            onMonthChange={setCalendarMonth}
            locale={locale}
            todayStr={todayStr}
          />
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
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

                // Live mode reminder: natalia_solo + requested + within 4 weeks
                const in4Weeks = (() => {
                  const d = slot?.slot_date;
                  if (!d) return false;
                  const plus28 = new Date(todayStr);
                  plus28.setDate(plus28.getDate() + 28);
                  const plus28Str = plus28.toISOString().slice(0, 10);
                  return d >= todayStr && d <= plus28Str;
                })();
                const showLiveReminder = b.session_type === 'natalia_solo' && b.live_mode === 'requested' && in4Weeks && statusTab === 'upcoming';

                const isGhost = !!b._isGhost;
                const isPendingReschedule = !isGhost && b.reschedule_status === 'pending';
                const rowLinkId = b._originalId || b.id;

                const hasRecording = !isGhost && statusTab === 'past' && !!b.readySesjaRecordingId;
                const isExpanded = expandedRecordingId === b.readySesjaRecordingId;

                return (
                  <div key={isGhost ? `ghost-${b._originalId}` : b.id}>
                    <div
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                        isGhost
                          ? 'bg-htg-card border-2 border-dashed border-htg-fg dark:border-htg-fg'
                          : isPendingReschedule
                            ? 'bg-black text-white border-2 border-black'
                            : isToday && statusTab === 'upcoming'
                              ? 'bg-htg-sage/5 border-htg-sage/30'
                              : 'bg-htg-card border-htg-card-border'
                      } ${!isGhost && statusTab === 'past' ? 'opacity-70' : ''}`}
                    >
                      <Link href={{pathname: '/konto/admin/planer/[id]', params: {id: rowLinkId}}} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isPendingReschedule && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/40 font-medium">⟳ zmiana terminu</span>
                          )}
                          {!isGhost && isToday && statusTab === 'upcoming' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-htg-sage text-white font-bold">DZIŚ</span>
                          )}
                          <span className="text-xs text-htg-fg-muted font-normal">{getDayShort(slot?.slot_date)}</span>
                          <span className="font-bold text-htg-fg">{slot?.slot_date || '—'}</span>
                          <span className="text-htg-fg">{slot?.start_time?.slice(0, 5) || ''}</span>
                          {!isGhost && b.created_by_email === 'agata@htg.cyou' && (
                            <span className={`text-xs font-bold ${isPendingReschedule ? 'text-white' : 'text-htg-fg'}`}>(A)</span>
                          )}
                          {isGhost && <span className="text-xs font-semibold text-htg-fg">nowy</span>}
                          {typeTab === 'all' && <TypeBadge type={b.session_type} />}
                          {b.live_mode === 'requested' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-medium">Live?</span>
                          )}
                          {b.live_mode === 'confirmed_live' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-300 dark:border-green-700 font-medium">Live</span>
                          )}
                          {b.live_mode === 'confirmed_online' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-300 dark:border-sky-700 font-medium">Online</span>
                          )}
                          {b.completion_status === 'no_show' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-medium">Nie stawił się</span>
                          )}
                          {b.completion_status === 'cancelled_by_htg' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-300 dark:border-red-700 font-medium">Odwołana</span>
                          )}
                        </div>
                        <p className={`text-sm mt-0.5 ${isPendingReschedule ? 'text-white/80' : 'text-htg-fg-muted'}`}>
                          {client?.display_name || client?.email || '—'}
                          {client?.email && client?.display_name && (
                            <span className="text-xs ml-1 opacity-60">{client.email}</span>
                          )}
                        </p>
                        {b.topics && statusTab === 'upcoming' && (
                          <p className="text-xs text-htg-fg-muted mt-0.5 line-clamp-1">📝 {b.topics}</p>
                        )}
                        {showLiveReminder && (
                          <p className="text-xs mt-1 font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            ⚠ Potwierdzić tryb live lub online?
                          </p>
                        )}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isGhost && <span className={`text-xs px-2 py-1 rounded-full ${ps.className}`}>{ps.label}</span>}
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
                        {!isGhost && (
                          <Link href={{pathname: '/konto/admin/uzytkownicy/[id]', params: {id: b.user_id}}}
                            className="p-1.5 rounded-lg text-htg-fg-muted hover:text-htg-indigo hover:bg-htg-indigo/10 transition-colors"
                            title="Profil klienta" onClick={e => e.stopPropagation()}>
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {hasRecording && isExpanded && (
                      <div className="mt-1 rounded-xl overflow-hidden border border-htg-card-border bg-black">
                        <SessionReviewPlayer
                          playbackId={b.readySesjaRecordingId}
                          idFieldName="recordingId"
                          userEmail={adminUserEmail}
                          userId={adminUserId}
                          tokenEndpoint="/api/video/booking-recording-token"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create session modal */}
      {showCreate && (
        <CreateSessionModal
          locale={locale}
          onCreated={() => router.refresh()}
          onClose={() => setShowCreate(false)}
        />
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
