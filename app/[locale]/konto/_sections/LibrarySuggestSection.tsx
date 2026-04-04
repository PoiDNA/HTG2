import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Film, ArrowRight } from 'lucide-react';
import { formatSesjeMonthPl } from '@/lib/booking/constants';

interface Props {
  userId: string;
  locale: string;
}

export default async function LibrarySuggestSection({ userId, locale }: Props) {
  const db = createSupabaseServiceRole();

  // 1. Get user's owned set IDs
  const { data: owned } = await db
    .from('entitlements')
    .select('monthly_set_id, scope_month')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString())
    .not('monthly_set_id', 'is', null);

  const ownedSetIds = new Set((owned ?? []).map((e) => e.monthly_set_id as string));

  // 2. Fetch 6 latest published sets with their session counts and price
  const { data: sets } = await db
    .from('monthly_sets')
    .select(`
      id, title, description, month_label, cover_image_url,
      product:products (
        id,
        prices (stripe_price_id, amount, currency, interval, is_active)
      ),
      set_sessions (id)
    `)
    .eq('is_published', true)
    .order('month_label', { ascending: false })
    .limit(6);

  // 3. Filter out owned, take first 3
  const suggestions = (sets ?? [])
    .filter((s) => !ownedSetIds.has(s.id))
    .slice(0, 3);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-10 pt-8 border-t border-htg-card-border">
      <div className="flex items-center gap-3 mb-2">
        <Film className="w-5 h-5 text-htg-sage" />
        <h2 className="text-xl font-serif font-bold text-htg-fg">Biblioteka sesji</h2>
      </div>
      <p className="text-sm text-htg-fg-muted mb-6">
        Nagrane sesje dostępne do odsłuchania w dowolnym momencie — wróć ile razy chcesz.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {suggestions.map((set) => {
          const product = set.product as any;
          const prices: any[] = product?.prices ?? [];
          const activePrice = prices.find((p: any) => p.is_active);
          const priceStr = activePrice
            ? `${Math.round(activePrice.amount / 100)} zł`
            : null;

          const sessionCount = (set.set_sessions as any[])?.length ?? 0;
          const monthLabel = set.month_label
            ? formatSesjeMonthPl(set.month_label)
            : null;

          return (
            <div
              key={set.id}
              className="bg-htg-card border border-htg-card-border rounded-2xl overflow-hidden flex flex-col"
            >
              {/* Cover image or placeholder */}
              {set.cover_image_url ? (
                <div
                  className="h-32 bg-cover bg-center"
                  style={{ backgroundImage: `url(${set.cover_image_url})` }}
                />
              ) : (
                <div className="h-32 bg-htg-sage/10 flex items-center justify-center">
                  <Film className="w-10 h-10 text-htg-sage/40" />
                </div>
              )}

              <div className="p-4 flex flex-col flex-grow gap-2">
                {monthLabel && (
                  <span className="text-[11px] font-semibold text-htg-sage uppercase tracking-wider">
                    {monthLabel}
                  </span>
                )}
                <h3 className="text-base font-serif font-semibold text-htg-fg leading-snug">
                  {set.title}
                </h3>
                {set.description && (
                  <p className="text-sm text-htg-fg-muted line-clamp-2">
                    {set.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-xs text-htg-fg-muted">
                    {sessionCount} {sessionCount === 1 ? 'sesja' : sessionCount < 5 ? 'sesje' : 'sesji'}
                  </span>
                  {priceStr && (
                    <span className="text-sm font-semibold text-htg-fg">{priceStr}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href={`/${locale}/konto`}
        className="inline-flex items-center gap-2 bg-htg-sage text-white text-base font-semibold px-6 py-3 rounded-xl hover:bg-htg-sage/90 transition-colors"
      >
        <Film className="w-5 h-5" />
        Przejdź do Biblioteki sesji
        <ArrowRight className="w-5 h-5" />
      </Link>
    </div>
  );
}
