import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { redirect } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Bookmark, BookOpen, ChevronRight, PenLine, CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

function fmtMonth(label: string): string {
  // "2026-04" → "kwiecień 2026"
  const [year, month] = label.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('pl', { month: 'long', year: 'numeric' });
}

export default async function AdminMomentyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await requireAdmin();
  if ('error' in result) return redirect({ href: '/konto', locale });

  const db = createSupabaseServiceRole();

  // ── Monthly sets with their sessions (ordered newest first) ──────────────────
  const { data: sets } = await db
    .from('monthly_sets')
    .select('id, month_label, title, set_sessions(session:session_templates(id, title, title_i18n, is_published, created_at))')
    .order('month_label', { ascending: false });

  // ── All published sessions not in any set ────────────────────────────────────
  const { data: allSessions } = await db
    .from('session_templates')
    .select('id, title, title_i18n, is_published, created_at')
    .order('created_at', { ascending: false });

  // ── Moment counts ────────────────────────────────────────────────────────────
  let fragmentCounts: Map<string, number> = new Map();
  let migrationsNeeded = false;

  const { data: countRows, error: countError } = await db
    .from('session_fragments')
    .select('session_template_id');

  if (countError?.code === '42P01') {
    console.warn('[admin/momenty] session_fragments table not found — run migrations 084–090');
    migrationsNeeded = true;
  } else if (!countError && countRows) {
    for (const row of countRows) {
      const prev = fragmentCounts.get(row.session_template_id) ?? 0;
      fragmentCounts.set(row.session_template_id, prev + 1);
    }
  }

  // ── Build grouped structure ──────────────────────────────────────────────────
  type SessionRow = {
    id: string;
    title: string | null;
    title_i18n: Record<string, string> | null;
    is_published: boolean;
    created_at: string;
  };

  const setSessionIds = new Set<string>();

  const groups: Array<{
    monthLabel: string | null;      // null = "Bez zestawu"
    setTitle: string | null;
    sessions: SessionRow[];
  }> = [];

  for (const set of sets ?? []) {
    const sessions = (set.set_sessions ?? [])
      .map((ss: any) => ss.session)
      .filter(Boolean) as SessionRow[];
    sessions.forEach(s => setSessionIds.add(s.id));
    groups.push({ monthLabel: set.month_label, setTitle: set.title, sessions });
  }

  // Sessions not in any set
  const orphanSessions = (allSessions ?? []).filter(s => !setSessionIds.has(s.id));
  if (orphanSessions.length > 0) {
    groups.push({ monthLabel: null, setTitle: null, sessions: orphanSessions });
  }

  const totalSessions = (allSessions ?? []).length;
  const totalFragments = Array.from(fragmentCounts.values()).reduce((s, c) => s + c, 0);
  const sessionsWithFragments = fragmentCounts.size;

  function SessionCard({ session }: { session: SessionRow }) {
    const count = fragmentCounts.get(session.id) ?? 0;
    const title = (session.title_i18n as Record<string, string> | null)?.pl
      || session.title
      || session.id;

    return (
      <Link
        href={{ pathname: '/konto/admin/momenty/[sessionId]', params: { sessionId: session.id } }}
        className="flex items-center justify-between px-6 py-3.5 hover:bg-htg-surface/50 transition-colors group"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-htg-fg truncate">{title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                session.is_published
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
              }`}>
                {session.is_published ? 'opublikowana' : 'szkic'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5">
            <Bookmark className={`w-3.5 h-3.5 ${count > 0 ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
            <span className={`text-sm font-semibold tabular-nums ${count > 0 ? 'text-htg-sage' : 'text-htg-fg-muted'}`}>
              {count}
            </span>
            <span className="text-xs text-htg-fg-muted hidden sm:inline">
              {count === 1 ? 'Moment' : count >= 2 && count <= 4 ? 'Momenty' : 'Momentów'}
            </span>
          </div>
          <PenLine className="w-4 h-4 text-htg-fg-muted group-hover:text-htg-sage transition-colors" />
          <ChevronRight className="w-4 h-4 text-htg-fg-muted" />
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bookmark className="w-6 h-6 text-htg-sage" />
        <div>
          <h1 className="font-serif text-2xl font-bold text-htg-fg">Momenty sesji</h1>
          <p className="text-sm text-htg-fg-muted mt-0.5">
            Zarządzaj predefined Momentami dla sesji bibliotecznych
          </p>
        </div>
      </div>

      {/* Migration warning */}
      {migrationsNeeded && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-400 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            Tabela <code className="font-mono text-xs bg-amber-500/10 px-1 rounded">session_fragments</code> nie
            istnieje w bazie — uruchom migracje 084–091 w Supabase SQL Editor.
            Momenty nie będą dostępne dla użytkowników do czasu wdrożenia migracji.
          </span>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-fg">{totalSessions}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Sesje w bibliotece</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-sage">{sessionsWithFragments}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Sesje z Momentami</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-htg-indigo">{totalFragments}</p>
          <p className="text-xs text-htg-fg-muted mt-0.5">Momentów łącznie</p>
        </div>
      </div>

      {/* Sessions grouped by month */}
      {groups.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-2xl px-6 py-12 text-center">
          <p className="text-htg-fg-muted text-sm">Brak sesji w bibliotece</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.monthLabel ?? '__orphan__'}
              className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden"
            >
              {/* Month header */}
              <div className="px-6 py-3 border-b border-htg-card-border flex items-center gap-2 bg-htg-surface/30">
                <CalendarDays className="w-3.5 h-3.5 text-htg-indigo shrink-0" />
                {group.monthLabel ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-htg-fg capitalize">
                      {fmtMonth(group.monthLabel)}
                    </span>
                    <span className="text-xs font-mono text-htg-fg-muted bg-htg-surface px-1.5 py-0.5 rounded">
                      {group.monthLabel}
                    </span>
                    {group.setTitle && (
                      <span className="text-xs text-htg-fg-muted truncate">— {group.setTitle}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-htg-fg-muted">Bez zestawu</span>
                )}
                <span className="ml-auto text-xs text-htg-fg-muted shrink-0">
                  {group.sessions.length} {group.sessions.length === 1 ? 'sesja' : 'sesji'}
                </span>
              </div>

              {/* Session rows */}
              <div className="divide-y divide-htg-card-border">
                {group.sessions.map(session => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
