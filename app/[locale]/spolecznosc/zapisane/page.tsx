import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BookmarksList } from '@/components/community/BookmarksList';
import { Bookmark } from 'lucide-react';
import { Link } from '@/i18n-config';

export default async function BookmarksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/spolecznosc" className="text-sm text-htg-fg-muted hover:text-htg-fg">
          ← Społeczność
        </Link>
      </div>

      <h1 className="text-2xl font-serif font-bold text-htg-fg mb-6 flex items-center gap-2">
        <Bookmark className="w-6 h-6 text-htg-warm" />
        Zapisane posty
      </h1>

      <BookmarksList currentUserId={user.id} />
    </div>
  );
}
