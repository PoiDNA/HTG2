import { setRequestLocale } from 'next-intl/server';
import FavoritesList from '@/components/favorites/FavoritesList';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div>
      <h1 className="text-2xl font-serif font-bold text-htg-fg mb-6">Twoi Znajomi</h1>
      <FavoritesList />
    </div>
  );
}
