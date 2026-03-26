import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Play, Film } from 'lucide-react';

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

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch all active entitlements with session info
  const { data: entitlements } = await supabase
    .from('entitlements')
    .select(`
      id, type, scope_month, valid_from, valid_until, is_active,
      session:session_templates ( id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id ),
      product:products ( name, slug )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString())
    .order('valid_until', { ascending: false });

  const sessions = (entitlements || []).filter(
    (ent: any) => ent.session?.bunny_video_id
  );

  // Check for yearly access — if so, show all published sessions
  const hasYearly = (entitlements || []).some((ent: any) => ent.type === 'yearly');

  let allSessions: any[] = [];
  if (hasYearly) {
    const { data } = await supabase
      .from('session_templates')
      .select('id, slug, title, description, duration_minutes, bunny_video_id, bunny_library_id')
      .eq('is_published', true)
      .not('bunny_video_id', 'is', null)
      .order('sort_order', { ascending: true });
    allSessions = data || [];
  }

  const displaySessions = hasYearly
    ? allSessions.map((s: any) => ({ session: s, type: 'yearly' }))
    : sessions.map((ent: any) => ({ session: ent.session, type: ent.type }));

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">
        {t('my_sessions')}
      </h2>

      {displaySessions.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displaySessions.map((item: any) => {
            const session = item.session;
            if (!session) return null;

            return (
              <div
                key={session.id}
                className="bg-htg-card border border-htg-card-border rounded-xl p-4"
              >
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
          })}
        </div>
      )}
    </div>
  );
}
