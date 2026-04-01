import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';
import { Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import AuditPageView from './AuditPageView';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const PAGE_SIZE = 50;

// Status options for filter
const STATUS_OPTIONS = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'ready', label: 'Gotowe' },
  { value: 'processing', label: 'Przetwarzane' },
  { value: 'failed', label: 'Nieudane' },
  { value: 'manual_review', label: 'Do przeglądu (import)' },
] as const;

interface Participant {
  display_name: string;
  email: string | null;
  revoked: boolean;
}

export default async function AdminRecordingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Admin check
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    redirect(`/${locale}/konto`);
  }

  const sp = await searchParams;
  const statusFilter = (sp.status as string) ?? 'all';
  const searchQuery = (sp.q as string) ?? '';
  const page = Math.max(1, parseInt((sp.page as string) ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = createSupabaseServiceRole();

  // Build query
  let query = db
    .from('booking_recordings')
    .select(`
      id, title, session_type, session_date, status, duration_seconds,
      source, import_confidence, legal_hold,
      booking_recording_access(user_id, revoked_at, profiles(display_name, email))
    `, { count: 'exact' })
    .order('session_date', { ascending: false, nullsFirst: false });

  // Status filter
  if (statusFilter === 'manual_review') {
    query = query.eq('import_confidence', 'manual_review');
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  // Search by display_name (if query is provided, fetch all and filter in JS for simplicity)
  // For production at scale, this should use a full-text search index
  const { data: allData, count: totalCount } = await query.range(offset, offset + PAGE_SIZE - 1);

  // Map participants per recording
  type RecordingRow = NonNullable<typeof allData>[number];
  const rows = (allData ?? []).map((rec: RecordingRow) => {
    const accessRows = (rec.booking_recording_access ?? []) as unknown as Array<{
      user_id: string;
      revoked_at: string | null;
      profiles: { display_name: string | null; email: string | null } | null;
    }>;

    const participants: Participant[] = accessRows.map((a) => ({
      display_name: a.profiles?.display_name ?? a.profiles?.email ?? '—',
      email: a.profiles?.email ?? null,
      revoked: !!a.revoked_at,
    }));

    return { ...rec, participants };
  });

  // Client-side search filter (simple substring match on participant names)
  const filteredRows = searchQuery
    ? rows.filter((r) =>
        r.participants.some((p) =>
          p.display_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : rows;

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div>
      <AuditPageView page="nagrania-klientow" />

      <div className="flex items-center gap-3 mb-6">
        <Headphones className="w-6 h-6 text-htg-sage" />
        <h1 className="text-xl font-serif font-bold text-htg-fg">Nagrania klientów</h1>
        <span className="text-sm text-htg-fg-muted">({totalCount ?? 0})</span>
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

        <input
          name="q"
          type="text"
          defaultValue={searchQuery}
          placeholder="Szukaj po nazwie klienta..."
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
              <th className="pb-3 pr-4 font-medium">Dostęp</th>
              <th className="pb-3 pr-4 font-medium">Typ</th>
              <th className="pb-3 pr-4 font-medium">Data sesji</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Czas</th>
              <th className="pb-3 pr-4 font-medium">Źródło</th>
              <th className="pb-3 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((rec) => {
              const sessionType = rec.session_type as SessionType | null;
              const config = sessionType ? SESSION_CONFIG[sessionType] : null;

              return (
                <tr key={rec.id} className="border-b border-htg-card-border/50 hover:bg-htg-surface/50 transition-colors">
                  {/* Dostęp */}
                  <td className="py-3 pr-4">
                    {rec.participants.length === 0 ? (
                      <span className="text-htg-fg-muted italic">Brak</span>
                    ) : (
                      <div className="space-y-0.5">
                        {rec.participants.map((p, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span
                              className={`text-xs ${p.revoked ? 'line-through text-htg-fg-muted' : 'text-htg-fg'}`}
                              title={p.email ?? undefined}
                            >
                              {p.display_name}
                            </span>
                            {p.revoked && (
                              <span className="text-[10px] text-red-400">cofnięty</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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

                  {/* Data */}
                  <td className="py-3 pr-4 text-htg-fg whitespace-nowrap">
                    {rec.session_date
                      ? new Date(rec.session_date).toLocaleDateString('pl-PL')
                      : '—'}
                  </td>

                  {/* Status */}
                  <td className="py-3 pr-4">
                    <StatusBadge status={rec.status} />
                  </td>

                  {/* Czas */}
                  <td className="py-3 pr-4 text-htg-fg-muted whitespace-nowrap">
                    {rec.duration_seconds
                      ? `${Math.floor(rec.duration_seconds / 60)} min`
                      : '—'}
                  </td>

                  {/* Źródło */}
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      rec.source === 'live'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {rec.source === 'live' ? 'Live' : 'Import'}
                    </span>
                  </td>

                  {/* Confidence */}
                  <td className="py-3">
                    {rec.source === 'import' && rec.import_confidence ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        rec.import_confidence === 'exact_email'
                          ? 'bg-green-500/10 text-green-400'
                          : rec.import_confidence === 'admin_assigned'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {rec.import_confidence}
                      </span>
                    ) : (
                      <span className="text-htg-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-htg-fg-muted">
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
              href={`?status=${statusFilter}&q=${searchQuery}&page=${page - 1}`}
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
              href={`?status=${statusFilter}&q=${searchQuery}&page=${page + 1}`}
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-500/10 text-green-400',
    processing: 'bg-blue-500/10 text-blue-400',
    uploading: 'bg-blue-500/10 text-blue-400',
    preparing: 'bg-blue-500/10 text-blue-400',
    queued: 'bg-gray-500/10 text-gray-400',
    failed: 'bg-red-500/10 text-red-400',
    expired: 'bg-gray-500/10 text-gray-500',
    ignored: 'bg-gray-500/10 text-gray-500',
  };

  const labels: Record<string, string> = {
    ready: 'Gotowe',
    processing: 'Przetwarzane',
    uploading: 'Wysyłane',
    preparing: 'Przygotowywane',
    queued: 'W kolejce',
    failed: 'Nieudane',
    expired: 'Wygasłe',
    ignored: 'Zignorowane',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-500/10 text-gray-400'}`}>
      {labels[status] ?? status}
    </span>
  );
}
