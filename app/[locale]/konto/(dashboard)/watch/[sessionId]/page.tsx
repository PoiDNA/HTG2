import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { redirect } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import SessionReviewPlayer from '@/components/session-review/SessionReviewPlayer';
import { pickLocale } from '@/lib/utils/pick-locale';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account' });
  return { title: t('watch') };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const { userId, supabase } = await getEffectiveUser();

  // Fetch user email for watermark
  const db = (await import('@/lib/supabase/service')).createSupabaseServiceRole();
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const userEmail = authUser?.user?.email ?? '';

  // Fetch session template
  const { data: session } = await supabase
    .from('session_templates')
    .select('id, slug, title, title_i18n, description, description_i18n, duration_minutes, bunny_video_id, bunny_library_id')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return (
      <div className="text-center py-16">
        <p className="text-htg-fg-muted">Nie znaleziono sesji.</p>
        <Link
          href="/konto"
          className="inline-block mt-4 text-htg-sage hover:underline"
        >
          {t('my_sessions')}
        </Link>
      </div>
    );
  }

  // Check session entitlement first
  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('is_active', true)
    .gt('valid_until', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  let hasSetAccess = false;
  if (!entitlement) {
    // 2. Find the sets this session belongs to
    const { data: sessionSets } = await supabase
      .from('set_sessions')
      .select('set_id, monthly_set:monthly_sets(month_label)')
      .eq('session_id', sessionId);
    const setIds = (sessionSets || []).map(ss => ss.set_id);

    if (setIds.length > 0) {
      // 3. Check for entitlement with monthly_set_id
      const { data: setEnt } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', userId)
        .in('type', ['yearly', 'monthly'])
        .in('monthly_set_id', setIds)
        .eq('is_active', true)
        .gt('valid_until', new Date().toISOString())
        .limit(1)
        .maybeSingle();
      hasSetAccess = !!setEnt;

      // 4. Fallback for legacy entitlements without monthly_set_id
      if (!hasSetAccess) {
        const setMonths = (sessionSets || [])
          .map(ss => (ss as any).monthly_set?.month_label)
          .filter(Boolean);
        if (setMonths.length > 0) {
          const { data: legacyEnt } = await supabase
            .from('entitlements')
            .select('id')
            .eq('user_id', userId)
            .in('type', ['yearly', 'monthly'])
            .is('monthly_set_id', null)
            .in('scope_month', setMonths)
            .eq('is_active', true)
            .gt('valid_until', new Date().toISOString())
            .limit(1)
            .maybeSingle();
          hasSetAccess = !!legacyEnt;
        }
      }
    }
  }

  const hasAccess = !!entitlement || hasSetAccess;

  // Fetch monthly set info if session belongs to one
  const { data: setSession } = await supabase
    .from('set_sessions')
    .select('monthly_set:monthly_sets ( title, title_i18n )')
    .eq('session_id', sessionId)
    .limit(1)
    .single();

  const rawSet = (setSession as any)?.monthly_set;
  const setTitle = rawSet ? pickLocale(rawSet.title_i18n, locale, rawSet.title) : null;

  return (
    <div>
      <Link
        href="/konto"
        className="inline-flex items-center gap-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('my_sessions')}
      </Link>

      <div className="mb-6">
        {setTitle && (
          <p className="text-sm text-htg-sage font-medium mb-1">{setTitle}</p>
        )}
        <h2 className="text-2xl font-serif font-bold text-htg-fg">
          {pickLocale((session as any).title_i18n, locale, session.title)}
        </h2>
        {session.description && (
          <p className="text-htg-fg-muted mt-2">{pickLocale((session as any).description_i18n, locale, session.description)}</p>
        )}
        {session.duration_minutes && (
          <p className="text-sm text-htg-fg-muted mt-1">
            {session.duration_minutes} min
          </p>
        )}
      </div>

      {hasAccess ? (
        <SessionReviewPlayer
          playbackId={session.id}
          idFieldName="sessionId"
          userEmail={userEmail}
          userId={userId}
          tokenEndpoint="/api/video/token"
        />
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Lock className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-htg-fg mb-2">
            Brak dostępu
          </h3>
          <p className="text-htg-fg-muted mb-6">
            Nie masz aktywnego dostępu do tej sesji. Wykup subskrypcję, aby oglądać.
          </p>
          <Link
            href="/subskrypcje"
            className="inline-block bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors"
          >
            Zobacz plany
          </Link>
        </div>
      )}
    </div>
  );
}
