import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { buildVodLibrary } from '@/lib/services/vod-library';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import SluchajClient from './SluchajClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function SluchajPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId, supabase } = await getEffectiveUser();
  const library = await buildVodLibrary(supabase, userId, locale);

  // Fetch user email for player watermark (same pattern as watch/[sessionId]/page.tsx)
  const db = createSupabaseServiceRole();
  const [
    { data: authUser },
    { data: listensRows },
    { data: bookmarkRows },
  ] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('session_listens').select('session_id').eq('user_id', userId),
    db.from('session_bookmarks').select('session_id').eq('user_id', userId),
  ]);

  const userEmail = authUser?.user?.email ?? '';
  const listenedIds = (listensRows ?? []).map((r: { session_id: string }) => r.session_id);
  const bookmarkedIds = (bookmarkRows ?? []).map((r: { session_id: string }) => r.session_id);

  return (
    <SluchajClient
      sections={library.sections}
      singleSessions={library.singleSessions}
      userId={userId}
      userEmail={userEmail}
      listenedSessionIds={listenedIds}
      bookmarkedSessionIds={bookmarkedIds}
    />
  );
}
