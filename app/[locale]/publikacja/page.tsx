import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SessionStats } from '@/components/publikacja/SessionStats';
import { PublicationStatusBadge } from '@/components/publikacja/PublicationStatusBadge';
import { Link } from '@/i18n-config';
import type { PublicationStats, PublicationStatus } from '@/lib/publication/types';

export default async function PublikacjaDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const supabase = createSupabaseServiceRole();

  // Fetch stats
  const { data: allSessions } = await supabase
    .from('session_publications')
    .select('id, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);

  const sessions = allSessions || [];

  const stats: PublicationStats = {
    total: sessions.length,
    raw: sessions.filter((s) => s.status === 'raw').length,
    editing: sessions.filter((s) => s.status === 'editing').length,
    edited: sessions.filter((s) => s.status === 'edited').length,
    mastering: sessions.filter((s) => s.status === 'mastering').length,
    published: sessions.filter((s) => s.status === 'published').length,
  };

  // Recent activity (last 10 updated)
  const recent = sessions.slice(0, 10);

  const statusLabels: Record<string, string> = {
    raw: t('status_raw'),
    editing: t('status_editing'),
    edited: t('status_edited'),
    mastering: t('status_mastering'),
    published: t('status_published'),
  };

  return (
    <div className="space-y-8">
      <SessionStats
        stats={stats}
        labels={{
          total: t('stats_total'),
          raw: t('status_raw'),
          editing: t('status_editing'),
          edited: t('status_edited'),
          mastering: t('status_mastering'),
          published: t('status_published'),
        }}
      />

      {/* Recent activity */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="text-lg font-serif font-bold text-htg-fg mb-4">{t('recent_activity')}</h2>

        {recent.length === 0 ? (
          <p className="text-sm text-htg-fg-muted">{t('no_sessions')}</p>
        ) : (
          <div className="space-y-3">
            {recent.map((session) => (
              <Link
                key={session.id}
                href={{pathname: '/publikacja/sesje/[id]', params: {id: session.id}}}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg hover:bg-htg-surface transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg truncate">
                    {session.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-htg-fg-muted">
                    {new Date(session.updated_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <PublicationStatusBadge
                  status={session.status as PublicationStatus}
                  labels={statusLabels}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
