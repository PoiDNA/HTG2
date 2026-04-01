import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { Play, Film } from 'lucide-react';
import { formatSesjeMonthPl } from '@/lib/booking/constants';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account' });
  return { title: t('my_sessions') };
}

export default async function MySesjeListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const { userId, supabase } = await getEffectiveUser();

  // 1. Fetch active entitlements
  const { data: rawEntitlements } = await supabase
    .from('entitlements')
    .select('id, type, scope_month, monthly_set_id, session_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString());

  const entitlements = rawEntitlements || [];

  // 2. Gather keys
  const setIds = [...new Set(
    entitlements.filter(e => e.monthly_set_id).map(e => e.monthly_set_id!)
  )];
  const fallbackMonths = [...new Set(
    entitlements
      .filter(e => e.scope_month && !e.monthly_set_id)
      .map(e => e.scope_month!)
  )];
  const singleSessionIds = entitlements
    .filter(e => e.type === 'session' && e.session_id)
    .map(e => e.session_id!);

  // 3. Fetch monthly_sets by ID
  let setsByIdResults: any[] = [];
  if (setIds.length > 0) {
    const { data } = await supabase
      .from('monthly_sets')
      .select(`
        id, title, month_label,
        set_sessions (
          sort_order,
          session:session_templates (
            id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id
          )
        )
      `)
      .in('id', setIds)
      .eq('is_published', true)
      .order('month_label', { ascending: false });
    setsByIdResults = data || [];
  }

  // 4. Fetch fallback monthly_sets by month_label
  const alreadyCovered = new Set(setsByIdResults.map(s => s.month_label));
  const missing = fallbackMonths.filter(m => !alreadyCovered.has(m));

  let setsByMonthResults: any[] = [];
  if (missing.length > 0) {
    const { data } = await supabase
      .from('monthly_sets')
      .select(`
        id, title, month_label,
        set_sessions (
          sort_order,
          session:session_templates (
            id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id
          )
        )
      `)
      .in('month_label', missing)
      .eq('is_published', true)
      .order('month_label', { ascending: false });
    setsByMonthResults = data || [];
  }

  const allSets = [...setsByIdResults, ...setsByMonthResults];

  // 5. Fetch single sessions
  const monthlySessionIds = new Set(
    allSets.flatMap(s => (s.set_sessions || []).map((ss: any) => ss.session?.id).filter(Boolean))
  );
  const uniqueSingleIds = singleSessionIds.filter(id => !monthlySessionIds.has(id));

  let singleSessions: any[] = [];
  if (uniqueSingleIds.length > 0) {
    const { data } = await supabase
      .from('session_templates')
      .select('id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id')
      .in('id', uniqueSingleIds)
      .not('bunny_video_id', 'is', null);
    singleSessions = data || [];
  }

  // 6. Build sections
  type Session = { id: string; title: string; duration_minutes?: number; bunny_video_id: string };
  type MonthSection = {
    title: string;
    monthLabel: string;
    sessions: Session[];
  };

  const sections: MonthSection[] = [];

  for (const set of allSets) {
    const sessions = (set.set_sessions || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((ss: any) => ss.session)
      .filter((s: any) => s && s.bunny_video_id);
    
    // Deduplicate only WITHIN the section
    const unique = [...new Map(sessions.map((s: any) => [s.id, s])).values()] as Session[];
    if (unique.length > 0) {
      sections.push({ title: set.title, monthLabel: set.month_label, sessions: unique });
    }
  }

  // Placeholders for current and past months without sets
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allEntitledMonths = [...new Set(
    entitlements.filter(e => e.scope_month).map(e => e.scope_month!)
  )];
  const coveredMonths = new Set(sections.map(s => s.monthLabel));
  const missingCurrentOrPast = allEntitledMonths.filter(m => !coveredMonths.has(m) && m <= currentMonth);

  for (const sm of missingCurrentOrPast) {
    sections.push({ title: formatSesjeMonthPl(sm), monthLabel: sm, sessions: [] });
  }

  // Sort sections descending by monthLabel
  sections.sort((a, b) => b.monthLabel.localeCompare(a.monthLabel));

  // Future months notice
  const futureMonthsCount = allEntitledMonths.filter(m => !coveredMonths.has(m) && m > currentMonth).length;

  const renderSessionCard = (session: Session) => (
    <div key={session.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-htg-surface rounded-lg flex items-center justify-center shrink-0">
          <Play className="w-5 h-5 text-htg-sage" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-htg-fg truncate">
            {session.title}
          </h3>
          {session.duration_minutes && (
            <p className="text-sm text-htg-fg-muted">
              {session.duration_minutes} min
            </p>
          )}
        </div>
        <Link
          href={`/konto/watch/${session.id}` as any}
          className="shrink-0 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {t('watch')}
        </Link>
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">
        {t('my_sessions')}
      </h2>

      {sections.length === 0 && singleSessions.length === 0 && futureMonthsCount === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Film className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted mb-4">{t('no_sessions')}</p>
          <Link
            href="/sesje"
            className="inline-block bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors"
          >
            {t('browse_sessions')}
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map(section => (
            <div key={section.monthLabel} className="space-y-4">
              <h3 className="text-lg font-medium text-htg-fg flex items-center gap-2">
                {section.title}
                <span className="text-sm text-htg-fg-muted font-normal bg-htg-surface px-2 py-0.5 rounded-full">
                  {section.sessions.length}
                </span>
              </h3>
              {section.sessions.length === 0 ? (
                <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center text-htg-fg-muted">
                  Sesje w przygotowaniu
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.sessions.map(renderSessionCard)}
                </div>
              )}
            </div>
          ))}

          {singleSessions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-htg-fg flex items-center gap-2">
                Sesje pojedyncze
                <span className="text-sm text-htg-fg-muted font-normal bg-htg-surface px-2 py-0.5 rounded-full">
                  {singleSessions.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {singleSessions.map(renderSessionCard)}
              </div>
            </div>
          )}

          {futureMonthsCount > 0 && (
            <div className="bg-htg-sage/10 text-htg-sage border border-htg-sage/20 rounded-xl p-4 text-center text-sm font-medium">
              Masz dostęp do {futureMonthsCount} przyszłych miesięcy (pojawią się tutaj, gdy zostaną opublikowane).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
