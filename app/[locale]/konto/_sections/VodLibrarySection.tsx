import { getEffectiveUser } from '@/lib/admin/effective-user';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { Play, Film } from 'lucide-react';
import { formatSesjeMonthPl } from '@/lib/booking/constants';

/**
 * VOD subscription library section for /konto dashboard.
 * Shows entitlements + session_templates from monthly packages.
 * Wrapped in <Suspense> by parent — streams independently.
 */
export default async function VodLibrarySection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const { userId, supabase } = await getEffectiveUser();

  // Fetch user's active entitlements with session info
  const { data: entitlements } = await supabase
    .from('entitlements')
    .select(`
      id, type, scope_month, valid_from, valid_until, is_active,
      session:session_templates ( id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id ),
      product:products ( name, slug ),
      monthly_set:monthly_sets ( title )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString())
    .order('valid_until', { ascending: false });

  const sessions = entitlements || [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Film className="w-5 h-5 text-htg-sage" />
        <h2 className="text-lg font-serif font-semibold text-htg-fg">Twoja Biblioteka</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          <Play className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
          <p className="text-sm text-htg-fg-muted mb-4">
            Wykup subskrypcję, aby uzyskać dostęp do sesji.
          </p>
          <Link
            href="/sesje"
            className="inline-block bg-htg-sage text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors"
          >
            {t('browse_sessions')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((ent: Record<string, unknown>) => {
            const validDate = new Date(ent.valid_until as string).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            const session = ent.session as Record<string, unknown> | null;
            const product = ent.product as Record<string, unknown> | null;
            const monthlySet = ent.monthly_set as Record<string, unknown> | null;

            // Entitlement label: monthly_sets.title → formatSesjeMonthPl → product.name → fallback
            const entLabel = (monthlySet?.title as string)
              || (ent.scope_month ? formatSesjeMonthPl(ent.scope_month as string) : null)
              || (product?.name as string)
              || (ent.type === 'yearly' ? 'Pakiet Roczny' : 'Sesja');

            // Yearly entitlement = full catalog access
            if (ent.type === 'yearly') {
              return (
                <div key={ent.id as string} className="md:col-span-2 bg-htg-card border-2 border-htg-sage rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-serif font-semibold text-lg text-htg-fg">
                      {entLabel}
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
              <div key={ent.id as string} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-htg-surface rounded-lg flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5 text-htg-sage" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-htg-fg truncate">
                      {(session?.title as string) || entLabel}
                    </h3>
                    <p className="text-sm text-htg-fg-muted">
                      {t('valid_until', { date: validDate })}
                    </p>
                  </div>
                  {session?.bunny_video_id ? (
                    <Link
                      href={`/konto/watch/${session.id}` as string}
                      className="shrink-0 bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {t('watch') || 'Odsłuchaj'}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
