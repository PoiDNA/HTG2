import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { redirect } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Bookmark, BookOpen, ChevronRight, PenLine } from 'lucide-react';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminFragmentyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await requireAdmin();
  if ('error' in result) return redirect({ href: '/konto', locale });

  const db = createSupabaseServiceRole();

  // Fetch all session templates (published + drafts)
  const { data: sessions, error: sessionsError } = await db
    .from('session_templates')
    .select('id, title, title_i18n, is_published, created_at')
    .order('is_published', { ascending: false })
    .order('created_at', { ascending: false });

  if (sessionsError) {
    console.error('[admin/fragmenty] Failed to fetch sessions:', sessionsError);
  }

  // Fetch fragment counts per session (graceful fallback if table doesn't exist yet)
  let fragmentCounts: Map<string, number> = new Map();
  const { data: countRows, error: countError } = await db
    .from('session_fragments')
    .select('session_template_id');

  if (countError?.code === '42P01') {
    // session_fragments table doesn't exist yet — migrations pending
    console.warn('[admin/fragmenty] session_fragments table not found — run migrations 084–090');
  } else if (!countError && countRows) {
    for (const row of countRows) {
      const prev = fragmentCounts.get(row.session_template_id) ?? 0;
      fragmentCounts.set(row.session_template_id, prev + 1);
    }
  }

  const totalFragments = Array.from(fragmentCounts.values()).reduce((s, c) => s + c, 0);
  const sessionsWithFragments = fragmentCounts.size;
  const migrationsNeeded = countError?.code === '42P01';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Bookmark className="w-6 h-6 text-htg-sage" />
          <div>
            <h1 className="font-serif text-2xl font-bold text-htg-fg">Momenty sesji</h1>
            <p className="text-sm text-htg-fg-muted mt-0.5">
              Zarządzaj predefined Momentami dla sesji bibliotecznych
            </p>
          </div>
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
          <p className="text-2xl font-bold text-htg-fg">{(sessions || []).length}</p>
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

      {/* Session list */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-htg-card-border flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-htg-indigo" />
          <h3 className="font-semibold text-htg-fg text-sm">Sesje biblioteczne</h3>
        </div>

        {(!sessions || sessions.length === 0) ? (
          <p className="px-6 py-8 text-sm text-htg-fg-muted text-center">
            Brak sesji w bibliotece
          </p>
        ) : (
          <div className="divide-y divide-htg-card-border">
            {sessions.map((session) => {
              const count = fragmentCounts.get(session.id) ?? 0;
              const title = (session.title_i18n as Record<string, string> | null)?.pl
                || session.title
                || session.id;

              return (
                <Link
                  key={session.id}
                  href={{ pathname: '/konto/admin/momenty/[sessionId]', params: { sessionId: session.id } }}
                  className="flex items-center justify-between px-6 py-4 hover:bg-htg-surface/50 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-htg-fg truncate">{title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          session.is_published
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
                        }`}>
                          {session.is_published ? 'opublikowana' : 'szkic'}
                        </span>
                        <span className="text-xs text-htg-fg-muted">
                          {new Date(session.created_at).toLocaleDateString('pl')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Bookmark className={`w-3.5 h-3.5 ${count > 0 ? 'text-htg-sage' : 'text-htg-fg-muted'}`} />
                      <span className={`text-sm font-semibold ${count > 0 ? 'text-htg-sage' : 'text-htg-fg-muted'}`}>
                        {count}
                      </span>
                      <span className="text-xs text-htg-fg-muted">
                        {count === 1 ? 'Moment' : count >= 2 && count <= 4 ? 'Momenty' : 'Momentów'}
                      </span>
                    </div>
                    <PenLine className="w-4 h-4 text-htg-fg-muted group-hover:text-htg-sage transition-colors" />
                    <ChevronRight className="w-4 h-4 text-htg-fg-muted" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
