import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { Play } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase/server';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MySessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch user's active entitlements with session info
  const { data: entitlements } = user
    ? await supabase
        .from('entitlements')
        .select(`
          id, type, scope_month, valid_from, valid_until, is_active,
          session:session_templates ( id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id ),
          product:products ( name, slug )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gte('valid_until', new Date().toISOString())
        .order('valid_until', { ascending: false })
    : { data: null };

  const sessions = entitlements || [];

  return (
    <div>
      <ActiveCallsWidget locale={locale} />
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('my_sessions')}</h2>

      {sessions.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Play className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted mb-4">{t('no_sessions')}</p>
          <Link
            href="/sesje"
            className="inline-block bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors"
          >
            {t('browse_sessions')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((ent: any) => {
            const validDate = new Date(ent.valid_until).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            // Yearly entitlement = full catalog access
            if (ent.type === 'yearly') {
              return (
                <div key={ent.id} className="md:col-span-2 bg-htg-card border-2 border-htg-sage rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-serif font-semibold text-lg text-htg-fg">
                      {ent.product?.name || 'Pakiet Roczny'}
                    </h3>
                    <span className="text-xs font-medium bg-htg-sage/10 text-htg-sage px-3 py-1 rounded-full">
                      {t('subscription_active')}
                    </span>
                  </div>
                  <p className="text-sm text-htg-fg-muted">
                    {t('valid_until', { date: validDate })}
                  </p>
                  <p className="text-sm text-htg-sage mt-2">
                    Pełny dostęp do całego archiwum sesji
                  </p>
                </div>
              );
            }

            // Session or monthly entitlement
            return (
              <div key={ent.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-htg-surface rounded-lg flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5 text-htg-sage" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-htg-fg truncate">
                      {ent.session?.title || ent.product?.name || ent.scope_month || 'Sesja'}
                    </h3>
                    <p className="text-sm text-htg-fg-muted">
                      {t('valid_until', { date: validDate })}
                    </p>
                  </div>
                  {ent.session?.bunny_video_id && (
                    <Link
                      href={`/konto/watch/${ent.session.id}` as any}
                      className="shrink-0 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {t('watch') || 'Oglądaj'}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
