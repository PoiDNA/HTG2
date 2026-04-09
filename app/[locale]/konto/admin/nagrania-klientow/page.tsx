import { Fragment } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { canViewClientRecordings } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import AuditPageView from './AuditPageView';
import RecordingActions from './RecordingActions';
import ImportRecording from './ImportRecording';
import ScanBunnyButton from './ScanBunnyButton';
import TranscriptAccordion from './TranscriptAccordion';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'ready', label: 'Gotowe' },
  { value: 'processing', label: 'Przetwarzane' },
  { value: 'failed', label: 'Nieudane' },
  { value: 'manual_review', label: 'Do przeglądu (import)' },
] as const;

const PHASE_OPTIONS = [
  { value: 'all', label: 'Wszystkie fazy' },
  { value: 'wstep', label: 'Wstęp' },
  { value: 'sesja', label: 'Sesja' },
  { value: 'podsumowanie', label: 'Podsumowanie' },
] as const;

const PHASE_BADGE_COLORS: Record<string, string> = {
  wstep: 'bg-blue-600',
  sesja: 'bg-htg-sage',
  podsumowanie: 'bg-orange-600',
};

const PHASE_BADGE_LABELS: Record<string, string> = {
  wstep: 'Wstęp',
  sesja: 'Sesja',
  podsumowanie: 'Podsumowanie',
};

export default async function AdminRecordingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !canViewClientRecordings(user.email ?? '')) {
    redirect(`/${locale}/konto`);
  }

  const sp = await searchParams;
  const statusFilter = (sp.status as string) ?? 'all';
  const phaseFilter = (sp.phase as string) ?? 'all';
  const searchQuery = (sp.q as string) ?? '';
  const page = Math.max(1, parseInt((sp.page as string) ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = createSupabaseServiceRole();

  let query = db
    .from('booking_recordings')
    .select(`
      id, booking_id, title, session_type, session_date, status, duration_seconds,
      source, import_confidence, legal_hold, metadata, recording_phase, backup_status, backup_storage_path,
      booking_recording_access(user_id, revoked_at)
    `, { count: 'exact' })
    .order('session_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }); // secondary sort to keep phases of same session grouped

  if (statusFilter === 'manual_review') {
    query = query.eq('import_confidence', 'manual_review');
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  if (phaseFilter !== 'all') {
    query = query.eq('recording_phase', phaseFilter);
  }

  // When searching: fetch all records and filter in memory (no cross-page pagination issue)
  const { data: allData, count: totalCount } = searchQuery
    ? await query
    : await query.range(offset, offset + PAGE_SIZE - 1);

  // Fetch profiles for all user_ids
  const allUserIds = new Set<string>();
  for (const rec of allData ?? []) {
    const accessRows = (rec.booking_recording_access ?? []) as unknown as Array<{ user_id: string }>;
    for (const a of accessRows) {
      if (a.user_id) allUserIds.add(a.user_id);
    }
  }

  const profileMap = new Map<string, { display_name: string | null; email: string | null }>();
  if (allUserIds.size > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, display_name, email')
      .in('id', [...allUserIds]);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { display_name: p.display_name, email: p.email });
    }
  }

  // Bulk-fetch which bookings have ready insights, so we can render the
  // "Pokaż transkrypcję" toggle only for rows that have something to show.
  // One query per page (not per row) — keyed by booking_id.
  const allBookingIds = new Set<string>();
  for (const rec of allData ?? []) {
    const bid = (rec as Record<string, unknown>).booking_id as string | null;
    if (bid) allBookingIds.add(bid);
  }
  const insightsReadyBookingIds = new Set<string>();
  if (allBookingIds.size > 0) {
    const { data: insightsRows } = await db
      .from('session_client_insights')
      .select('booking_id')
      .in('booking_id', [...allBookingIds])
      .eq('status', 'ready');
    for (const row of insightsRows ?? []) {
      if (row.booking_id) insightsReadyBookingIds.add(row.booking_id);
    }
  }

  // Build rows
  type RecordingRow = NonNullable<typeof allData>[number];
  const rows = (allData ?? []).map((rec: RecordingRow) => {
    const accessRows = (rec.booking_recording_access ?? []) as unknown as Array<{
      user_id: string;
      revoked_at: string | null;
    }>;

    const participants = accessRows.map((a) => {
      const profile = profileMap.get(a.user_id);
      return {
        user_id: a.user_id,
        display_name: profile?.display_name ?? null,
        email: profile?.email ?? null,
        revoked: !!a.revoked_at,
      };
    });

    const meta = rec.metadata as Record<string, unknown> | null;
    const sourceEmail = (meta?.parsed_email as string) ?? null;

    return { ...rec, participants, sourceEmail };
  });

  // Search filter
  const filteredRows = searchQuery
    ? rows.filter((r) =>
        r.sourceEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.participants.some((p) =>
          (p.display_name ?? p.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : rows;

  // When searching: no pagination (all results shown). Otherwise paginate.
  const displayedRows = searchQuery ? filteredRows : filteredRows;
  const totalPages = searchQuery ? 0 : Math.ceil((totalCount ?? 0) / PAGE_SIZE);
  const displayCount = searchQuery ? filteredRows.length : (totalCount ?? 0);

  return (
    <div>
      <AuditPageView page="nagrania-klientow" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Headphones className="w-6 h-6 text-htg-sage" />
          <h1 className="text-xl font-serif font-bold text-htg-fg">Nagrania klientów</h1>
          <span className="text-sm text-htg-fg-muted">({displayCount})</span>
        </div>
      </div>

      {/* Import section */}
      <div className="flex items-start gap-4 flex-wrap">
        <ImportRecording />
        <ScanBunnyButton />
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-center gap-3 mb-6">
        <select
          name="status"
          defaultValue={statusFilter}
          className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          name="phase"
          defaultValue={phaseFilter}
          className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg"
        >
          {PHASE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <input
          name="q"
          type="text"
          defaultValue={searchQuery}
          placeholder="Szukaj po emailu lub nazwie..."
          className="bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg w-64"
        />

        <button
          type="submit"
          className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage/90 transition-colors"
        >
          Filtruj
        </button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-htg-card-border text-left text-htg-fg-muted">
              <th className="pb-3 pr-4 font-medium">Email z nagrania</th>
              <th className="pb-3 pr-4 font-medium">Typ</th>
              <th className="pb-3 pr-4 font-medium">Faza</th>
              <th className="pb-3 pr-4 font-medium">Data sesji</th>
              <th className="pb-3 pr-4 font-medium">Przydzielono</th>
              <th className="pb-3 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((rec) => {
              const sessionType = rec.session_type as SessionType | null;
              const config = sessionType ? SESSION_CONFIG[sessionType] : null;
              const phase = (rec.recording_phase as string | null) ?? 'sesja';
              const isNonSesja = phase !== 'sesja';
              const backupStatus = (rec as Record<string, unknown>).backup_status as string | null;
              const backupStoragePath = (rec as Record<string, unknown>).backup_storage_path as string | null;
              const recBookingId = (rec as Record<string, unknown>).booking_id as string | null;
              const hasInsights = recBookingId ? insightsReadyBookingIds.has(recBookingId) : false;

              return (
                <Fragment key={rec.id}>
                <tr className="border-b border-htg-card-border/50 hover:bg-htg-surface/50 transition-colors group">
                  {/* Email z nagrania */}
                  <td className="py-3 pr-4">
                    <span className="text-htg-fg text-xs">
                      {rec.sourceEmail ?? <span className="text-htg-fg-muted italic">brak</span>}
                    </span>
                  </td>

                  {/* Typ */}
                  <td className="py-3 pr-4">
                    {config ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] text-white ${config.color}`}>
                        {config.labelShort}
                      </span>
                    ) : (
                      <span className="text-htg-fg-muted text-xs">{sessionType ?? '—'}</span>
                    )}
                  </td>

                  {/* Faza + backup status */}
                  <td className="py-3 pr-4">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] text-white w-fit ${PHASE_BADGE_COLORS[phase] ?? 'bg-gray-500'}`}>
                        {PHASE_BADGE_LABELS[phase] ?? phase}
                      </span>
                      {phase === 'sesja' && backupStatus && (
                        <span
                          className={`text-[9px] ${backupStatus === 'ready' ? 'text-green-400' : backupStatus === 'failed' ? 'text-red-400' : 'text-htg-fg-muted'}`}
                          title={backupStoragePath ?? undefined}
                        >
                          Backup: {backupStatus}
                          {backupStoragePath && backupStatus === 'ready' ? ' ✓' : ''}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Data sesji */}
                  <td className="py-3 pr-4 text-htg-fg whitespace-nowrap">
                    {rec.session_date
                      ? new Date(rec.session_date).toLocaleDateString('pl-PL')
                      : '—'}
                  </td>

                  {/* Przydzielono */}
                  <td className="py-3 pr-4">
                    {isNonSesja ? (
                      <span className="text-htg-fg-muted italic text-xs">Nagranie wewnętrzne</span>
                    ) : rec.participants.length === 0 ? (
                      <span className="text-htg-fg-muted italic text-xs">Brak przydziału</span>
                    ) : (
                      <div className="space-y-0.5">
                        {rec.participants.map((p, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span
                              className={`text-xs ${p.revoked ? 'line-through text-htg-fg-muted' : 'text-htg-fg'}`}
                            >
                              {p.display_name ?? p.email ?? '—'}
                            </span>
                            <span className="text-[10px] text-htg-fg-muted">
                              {p.email ? `(${p.email})` : ''}
                            </span>
                            {p.revoked ? (
                              <span className="text-[10px] text-red-400">cofnięty</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 text-right">
                    <RecordingActions
                      recordingId={rec.id}
                      sourceEmail={rec.sourceEmail}
                      participants={rec.participants}
                      details={{
                        status: rec.status,
                        source: rec.source,
                        import_confidence: rec.import_confidence,
                        duration_seconds: rec.duration_seconds,
                        legal_hold: rec.legal_hold,
                      }}
                    />
                  </td>
                </tr>
                {hasInsights && recBookingId && (
                  <tr className="border-b border-htg-card-border/50">
                    <td colSpan={6} className="px-2 pb-3">
                      <TranscriptAccordion bookingId={recBookingId} hasInsights={hasInsights} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-htg-fg-muted">
                  Brak nagrań spełniających kryteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          {page > 1 ? (
            <a
              href={`?status=${statusFilter}&phase=${phaseFilter}&q=${searchQuery}&page=${page - 1}`}
              className="flex items-center gap-1 text-sm text-htg-sage hover:underline"
            >
              <ChevronLeft className="w-4 h-4" /> Poprzednia
            </a>
          ) : (
            <span className="flex items-center gap-1 text-sm text-htg-fg-muted">
              <ChevronLeft className="w-4 h-4" /> Poprzednia
            </span>
          )}

          <span className="text-sm text-htg-fg-muted">
            Strona {page} z {totalPages}
          </span>

          {page < totalPages ? (
            <a
              href={`?status=${statusFilter}&phase=${phaseFilter}&q=${searchQuery}&page=${page + 1}`}
              className="flex items-center gap-1 text-sm text-htg-sage hover:underline"
            >
              Następna <ChevronRight className="w-4 h-4" />
            </a>
          ) : (
            <span className="flex items-center gap-1 text-sm text-htg-fg-muted">
              Następna <ChevronRight className="w-4 h-4" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
