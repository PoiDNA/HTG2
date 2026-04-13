import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { buildVodLibrary } from '@/lib/services/vod-library';
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
  const library = await buildVodLibrary(supabase, userId);

  // Fetch user email for player watermark (same pattern as watch/[sessionId]/page.tsx)
  const db = (await import('@/lib/supabase/service')).createSupabaseServiceRole();
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const userEmail = authUser?.user?.email ?? '';

  return (
    <SluchajClient
      sections={library.sections}
      singleSessions={library.singleSessions}
      userId={userId}
      userEmail={userEmail}
    />
  );
}
