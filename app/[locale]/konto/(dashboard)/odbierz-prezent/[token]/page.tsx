import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Gift, ArrowLeft, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import ClaimButton from './ClaimButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function OdbierzPrezent({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?returnTo=/${locale}/konto/odbierz-prezent/${token}`);
  }

  const db = createSupabaseServiceRole();

  const { data: gift } = await db
    .from('session_gifts')
    .select(`
      id, status, message, claimed_at, created_at, purchased_by,
      entitlements!inner (
        id, type, valid_until,
        products ( name )
      )
    `)
    .eq('claim_token', token)
    .maybeSingle();

  if (!gift) {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/konto`} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-xl font-serif font-semibold text-htg-fg">Odbiór prezentu</h2>
        </div>
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5 text-center space-y-2">
          <XCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="font-medium text-htg-fg">Nie znaleziono prezentu</p>
          <p className="text-sm text-htg-fg-muted">Link może być nieprawidłowy lub wygasły.</p>
        </div>
      </div>
    );
  }

  if (gift.status === 'revoked') {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/konto`} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-xl font-serif font-semibold text-htg-fg">Odbiór prezentu</h2>
        </div>
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5 text-center space-y-2">
          <XCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="font-medium text-htg-fg">Prezent został odwołany</p>
          <p className="text-sm text-htg-fg-muted">Osoba, która wysłała prezent, odwołała go.</p>
        </div>
      </div>
    );
  }

  // Prevent purchaser from claiming their own gift
  const isSelf = gift.purchased_by === user.id;

  const entitlement = (gift as any).entitlements;
  const productName = entitlement?.products?.name ?? entitlement?.type ?? 'Sesja HTG';
  const validUntil = entitlement?.valid_until
    ? format(new Date(entitlement.valid_until), 'd MMMM yyyy', { locale: pl })
    : null;

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/konto`} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-xl font-serif font-semibold text-htg-fg flex items-center gap-2">
          <Gift className="w-5 h-5 text-htg-warm" />
          Odbiór prezentu
        </h2>
      </div>

      <div className="p-6 rounded-xl border border-htg-card-border bg-htg-card space-y-4">
        <div className="text-center space-y-1">
          <Gift className="w-12 h-12 text-htg-warm mx-auto" />
          <h3 className="text-lg font-serif font-semibold text-htg-fg">{productName}</h3>
          {validUntil && (
            <p className="text-sm text-htg-fg-muted">Ważna do {validUntil}</p>
          )}
        </div>

        {gift.message && (
          <div className="p-3 rounded-lg bg-htg-surface border border-htg-card-border">
            <p className="text-sm text-htg-fg-muted italic">&ldquo;{gift.message}&rdquo;</p>
          </div>
        )}

        {gift.status === 'claimed' ? (
          <div className="text-center py-2">
            <p className="text-emerald-600 font-medium">Ten prezent został już odebrany.</p>
            {gift.claimed_at && (
              <p className="text-sm text-htg-fg-muted mt-1">
                {format(new Date(gift.claimed_at), 'd MMMM yyyy', { locale: pl })}
              </p>
            )}
            <Link
              href={`/${locale}/konto/sesje-indywidualne`}
              className="inline-block mt-3 text-sm text-htg-warm hover:underline"
            >
              Przejdź do moich sesji →
            </Link>
          </div>
        ) : isSelf ? (
          <div className="text-center py-2">
            <p className="text-sm text-htg-fg-muted">Nie możesz odebrać własnego prezentu.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-htg-fg-muted text-center">
              Kliknij poniżej, aby przenieść sesję na swoje konto. Będziesz mógł jej użyć samodzielnie.
            </p>
            <ClaimButton token={token} locale={locale} />
          </>
        )}
      </div>
    </div>
  );
}
