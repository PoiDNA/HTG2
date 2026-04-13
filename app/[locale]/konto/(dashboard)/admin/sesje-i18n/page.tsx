import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import { Globe } from 'lucide-react';
import I18nRow from './I18nRow';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SessionI18nPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await requireAdmin();
  if ('error' in result) return redirect({ href: '/konto', locale });
  const { supabase } = result;

  // Fetch monthly sets with sessions and i18n columns
  const { data: sets } = await supabase
    .from('monthly_sets')
    .select('id, title, title_i18n, description, description_i18n, month_label, set_sessions(session:session_templates(id, title, title_i18n, description, description_i18n))')
    .eq('is_published', true)
    .order('month_label', { ascending: false });

  // Fetch standalone sessions (not in any set)
  const { data: allSessions } = await supabase
    .from('session_templates')
    .select('id, title, title_i18n, description, description_i18n')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  const setSessionIds = new Set(
    (sets ?? []).flatMap(s =>
      (s.set_sessions ?? []).map((ss: any) => ss.session?.id).filter(Boolean)
    )
  );
  const standaloneSessions = (allSessions ?? []).filter(s => !setSessionIds.has(s.id));

  // Count completeness
  const LOCALES = ['en', 'de', 'pt'] as const;
  function missingCount(i18n: any) {
    return LOCALES.filter(l => !i18n?.[l]).length;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Globe className="w-6 h-6 text-htg-sage" />
        <h1 className="font-serif text-2xl font-bold text-htg-fg">Tłumaczenia treści sesji</h1>
      </div>

      <p className="text-sm text-htg-fg-muted">
        Edytuj tytuły i opisy sesji dla języków EN / DE / PT.
        Zielona ikona = wypełnione, puste kółko = brakuje tłumaczenia.
      </p>

      {/* Monthly sets */}
      {(sets ?? []).map((set) => {
        const sessions = (set.set_sessions ?? [])
          .map((ss: any) => ss.session)
          .filter(Boolean);

        return (
          <section key={set.id}>
            <h2 className="text-base font-semibold text-htg-fg-muted uppercase tracking-wide mb-3">
              {set.month_label} — {set.title}
              {missingCount(set.title_i18n) > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-400">
                  (pakiet: brakuje {missingCount(set.title_i18n)} tłumaczeń)
                </span>
              )}
            </h2>

            {/* Monthly set itself */}
            <div className="mb-3">
              <p className="text-xs text-htg-fg-muted mb-1">Pakiet miesięczny</p>
              <I18nRow
                id={set.id}
                table="monthly_sets"
                title={set.title}
                description={set.description}
                titleI18n={set.title_i18n}
                descriptionI18n={set.description_i18n}
              />
            </div>

            {/* Sessions in set */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l-2 border-htg-card-border">
              {sessions.map((session: any) => (
                <I18nRow
                  key={session.id}
                  id={session.id}
                  table="session_templates"
                  title={session.title}
                  description={session.description}
                  titleI18n={session.title_i18n}
                  descriptionI18n={session.description_i18n}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Standalone sessions */}
      {standaloneSessions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-htg-fg-muted uppercase tracking-wide mb-3">
            Sesje bez pakietu
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {standaloneSessions.map((session) => (
              <I18nRow
                key={session.id}
                id={session.id}
                table="session_templates"
                title={session.title}
                description={session.description}
                titleI18n={session.title_i18n}
                descriptionI18n={session.description_i18n}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
