import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { Link } from '@/i18n-config';
import { Play, Calendar } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  return {
    title: t('title'),
    description: t('subtitle'),
    openGraph: {
      title: t('title'),
      description: t('subtitle'),
      url: `https://htg.cyou/${locale}/sesje`,
    },
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface SessionTemplate {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  thumbnail_url: string | null;
}

interface MonthlySet {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  month_label: string | null;
  cover_image_url: string | null;
  sessions: SessionTemplate[];
}

async function getMonthlySets(): Promise<MonthlySet[]> {
  const supabase = await createSupabaseServer();

  const { data: sets, error } = await supabase
    .from('monthly_sets')
    .select(`
      id, slug, title, description, month_label, cover_image_url,
      set_sessions (
        sort_order,
        session:session_templates ( id, slug, title, description, duration_minutes, thumbnail_url )
      )
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false });

  if (error || !sets) return [];

  return sets.map((set: any) => ({
    ...set,
    sessions: (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter(Boolean),
  }));
}

async function getStandaloneSessions(): Promise<SessionTemplate[]> {
  const supabase = await createSupabaseServer();

  // Sessions not in any set — for a la carte purchase
  const { data, error } = await supabase
    .from('session_templates')
    .select('id, slug, title, description, duration_minutes, thumbnail_url')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  return data || [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Sessions' });

  const [monthlySets, sessions] = await Promise.all([
    getMonthlySets(),
    getStandaloneSessions(),
  ]);

  const hasContent = monthlySets.length > 0 || sessions.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>
        <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      {/* Monthly sets */}
      {monthlySets.length > 0 && (
        <section className="mb-16">
          <h2 className="text-2xl font-serif font-bold text-htg-fg mb-6 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-htg-sage" />
            {t('monthly_sets')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {monthlySets.map((set) => (
              <div
                key={set.id}
                className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden"
              >
                {set.cover_image_url ? (
                  <img
                    src={set.cover_image_url}
                    alt={set.title}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-htg-surface flex items-center justify-center">
                    <Calendar className="w-12 h-12 text-htg-fg-muted" />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2">
                    {set.title}
                  </h3>
                  {set.description && (
                    <p className="text-htg-fg-muted text-sm mb-3">{set.description}</p>
                  )}
                  <p className="text-xs text-htg-fg-muted mb-3">
                    {t('sessions_in_set', { count: set.sessions.length })}
                  </p>
                  <ul className="space-y-1 mb-4">
                    {set.sessions.map((session) => (
                      <li key={session.id} className="flex items-center gap-2 text-sm text-htg-fg">
                        <Play className="w-3 h-3 text-htg-sage shrink-0" />
                        <span>{session.title}</span>
                        {session.duration_minutes && (
                          <span className="text-htg-fg-muted text-xs ml-auto">
                            {session.duration_minutes} min
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={'/subskrypcje' as any}
                    className="inline-block w-full text-center bg-htg-sage text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('buy_set')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Individual sessions */}
      {sessions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-bold text-htg-fg mb-6 flex items-center gap-2">
            <Play className="w-6 h-6 text-htg-sage" />
            {t('individual_sessions')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden hover:shadow-md transition-shadow group"
              >
                {session.thumbnail_url ? (
                  <img
                    src={session.thumbnail_url}
                    alt={session.title}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="aspect-video bg-htg-surface flex items-center justify-center">
                    <Play className="w-12 h-12 text-htg-fg-muted group-hover:text-htg-sage transition-colors" />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-serif font-semibold text-lg text-htg-fg mb-2 group-hover:text-htg-indigo transition-colors">
                    {session.title}
                  </h3>
                  {session.description && (
                    <p className="text-htg-fg-muted text-sm mb-3">{session.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    {session.duration_minutes && (
                      <span className="text-xs text-htg-fg-muted bg-htg-surface px-2 py-1 rounded">
                        {t('duration', { minutes: session.duration_minutes })}
                      </span>
                    )}
                    <span className="text-sm font-medium text-htg-sage">
                      {t('buy_access')} →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!hasContent && (
        <div className="text-center py-20">
          <Play className="w-16 h-16 text-htg-fg-muted mx-auto mb-4" />
          <h2 className="text-xl font-serif text-htg-fg mb-2">{t('empty_title')}</h2>
          <p className="text-htg-fg-muted">{t('empty_description')}</p>
        </div>
      )}
    </div>
  );
}
