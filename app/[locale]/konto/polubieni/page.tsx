import { setRequestLocale } from 'next-intl/server';
import FavoritesList from '@/components/favorites/FavoritesList';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();
    displayName = profile?.display_name || user.user_metadata?.full_name || '';
  }

  return (
    <div>
      <h1 className="text-2xl font-serif font-bold text-htg-fg mb-6">Twoi Znajomi</h1>
      <FavoritesList userDisplayName={displayName} />
    </div>
  );
}
