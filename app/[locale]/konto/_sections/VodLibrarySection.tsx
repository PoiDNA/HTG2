import { getEffectiveUser } from '@/lib/admin/effective-user';
import { getTranslations } from 'next-intl/server';
import { Film } from 'lucide-react';
import { buildVodLibrary } from '@/lib/services/vod-library';
import VodLibraryClient from './VodLibraryClient';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';

/**
 * VOD subscription library section for /konto dashboard.
 * Shows entitlements + session_templates grouped by month.
 * Wrapped in <Suspense> by parent — streams independently.
 */
export default async function VodLibrarySection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const { userId, supabase } = await getEffectiveUser();
  const library = await buildVodLibrary(supabase, userId);

  // Pobrać userEmail do watermarku + listened session IDs
  const db = createSupabaseServiceRole();
  const [{ data: authUser }, { data: listensRows }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('session_listens').select('session_id').eq('user_id', userId),
  ]);
  const userEmail = authUser?.user?.email ?? '';
  const listenedSessionIds = new Set((listensRows ?? []).map(r => r.session_id));

  if (library.sections.length === 0 && library.singleSessions.length === 0 && library.futureMonthsCount === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Film className="w-5 h-5 text-htg-sage" />
          <h2 className="text-lg font-serif font-semibold text-htg-fg">Twoja Biblioteka</h2>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-center">
          <Film className="w-10 h-10 text-htg-fg-muted/30 mx-auto mb-3" />
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
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Film className="w-5 h-5 text-htg-sage" />
        <h2 className="text-lg font-serif font-semibold text-htg-fg">Twoja Biblioteka</h2>
      </div>
      <VodLibraryClient
        sections={library.sections}
        singleSessions={library.singleSessions}
        futureMonthsCount={library.futureMonthsCount}
        userId={userId}
        userEmail={userEmail}
        listenedSessionIds={[...listenedSessionIds]}
      />
    </section>
  );
}
