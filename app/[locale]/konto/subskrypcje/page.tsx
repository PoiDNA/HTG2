import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { CreditCard, PlusCircle, CalendarDays, Infinity, Zap } from 'lucide-react';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { PRODUCT_SLUGS } from '@/lib/booking/constants';
import { formatDate as fmtDate, formatPrice as fmtPrice, getIntlLocale } from '@/lib/format';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Entitlement = {
  id: string;
  type: string;
  scope_month: string | null;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  stripe_subscription_id: string | null;
  product: { name: string } | null;
  monthly_set: { title: string } | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  prices: { amount: number; currency: string }[];
};

function formatMonth(scope: string, locale: string): string {
  const [y, m] = scope.split('-');
  const monthName = new Date(Number(y), parseInt(m, 10) - 1).toLocaleDateString(getIntlLocale(locale), { month: 'long' });
  return `${monthName} ${y}`;
}

function typeLabel(ent: Entitlement, locale: string): string {
  if (ent.type === 'yearly') return locale === 'pl' ? 'Pakiet Roczny' : locale === 'de' ? 'Jahrespaket' : locale === 'pt' ? 'Pacote Anual' : 'Yearly Package';
  if (ent.type === 'monthly') {
    const monthSuffix = ent.scope_month ? ` — ${formatMonth(ent.scope_month, locale)}` : '';
    return (locale === 'pl' ? 'Pakiet Miesięczny' : locale === 'de' ? 'Monatspaket' : locale === 'pt' ? 'Pacote Mensal' : 'Monthly Package') + monthSuffix;
  }
  return locale === 'pl' ? 'Sesja pojedyncza' : locale === 'de' ? 'Einzelsitzung' : locale === 'pt' ? 'Sessão individual' : 'Single Session';
}

function typeIcon(type: string) {
  if (type === 'yearly') return Infinity;
  if (type === 'monthly') return CalendarDays;
  return Zap;
}

function formatDate(iso: string, locale: string) {
  return fmtDate(iso, locale);
}

function formatPrice(amount: number, currency: string, locale: string) {
  return fmtPrice(amount, currency, locale);
}

export default async function MyActivationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await getEffectiveUser();
  const db = createSupabaseServiceRole();

  // Fetch entitlements
  const { data: entitlements } = await db
    .from('entitlements')
    .select('id, type, scope_month, valid_from, valid_until, is_active, stripe_subscription_id, product:products ( name ), monthly_set:monthly_sets ( title )')
    .eq('user_id', userId)
    .order('valid_until', { ascending: false });

  // Fetch purchasable packages (yearly, monthly, single)
  const { data: products } = await db
    .from('products')
    .select('id, name, slug, description, prices ( amount, currency )')
    .in('slug', [PRODUCT_SLUGS.YEARLY, PRODUCT_SLUGS.MONTHLY, PRODUCT_SLUGS.SINGLE_SESSION])
    .eq('is_active', true);

  const all = (entitlements || []) as unknown as Entitlement[];

  const active = all.filter(
    (e) => e.is_active && new Date(e.valid_until) > new Date()
  );

  const expired = all.filter(
    (e) => !e.is_active || new Date(e.valid_until) <= new Date()
  );

  const packages = (products || []) as Product[];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-1">Twoje Aktywacje</h2>
      <p className="text-sm text-htg-fg-muted mb-8">Aktywne subskrypcje i pakiety sesji</p>

      {/* Active entitlements */}
      {active.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center mb-8">
          <CreditCard className="w-10 h-10 text-htg-fg-muted mx-auto mb-3" />
          <p className="text-htg-fg-muted text-sm">Nie masz aktywnych pakietów ani subskrypcji.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {active.map((ent) => {
            const Icon = typeIcon(ent.type);
            const isActive = true;
            return (
              <div key={ent.id} className="bg-htg-card border border-htg-card-border rounded-xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-htg-sage/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-htg-sage" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-htg-fg">
                    {ent.monthly_set?.title 
                      || (ent.scope_month ? formatSesjeMonthPl(ent.scope_month) : null) 
                      || ent.product?.name 
                      || typeLabel(ent, locale)}
                  </p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    Ważne do: {formatDate(ent.valid_until, locale)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-full bg-htg-sage/10 text-htg-sage">
                  Aktywna
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-htg-card-border my-8" />

      {/* Add section */}
      <h3 className="text-base font-semibold text-htg-fg mb-4 flex items-center gap-2">
        <PlusCircle className="w-4 h-4 text-htg-indigo" />
        Dodaj pakiet lub subskrypcję
      </h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Sesja pojedyncza */}
        <Link
          href="/sesje-indywidualne"
          className="bg-htg-card border border-htg-card-border rounded-xl p-5 hover:border-htg-indigo/40 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-htg-indigo/10 flex items-center justify-center mb-3">
            <Zap className="w-4 h-4 text-htg-indigo" />
          </div>
          <p className="font-semibold text-htg-fg group-hover:text-htg-indigo transition-colors">Sesja z Natalią</p>
          <p className="text-xs text-htg-fg-muted mt-1">Kup pojedynczą sesję 1:1</p>
          {packages.find(p => p.slug === PRODUCT_SLUGS.SINGLE_SESSION)?.prices?.[0] && (
            <p className="text-sm font-medium text-htg-indigo mt-3">
              {formatPrice(
                packages.find(p => p.slug === PRODUCT_SLUGS.SINGLE_SESSION)!.prices[0].amount,
                packages.find(p => p.slug === PRODUCT_SLUGS.SINGLE_SESSION)!.prices[0].currency,
                locale,
              )}
            </p>
          )}
        </Link>

        {/* Pakiet miesięczny */}
        {packages.find(p => p.slug === PRODUCT_SLUGS.MONTHLY) && (() => {
          const pkg = packages.find(p => p.slug === PRODUCT_SLUGS.MONTHLY)!;
          return (
            <Link
              href="/sesje-indywidualne"
              className="bg-htg-card border border-htg-card-border rounded-xl p-5 hover:border-htg-indigo/40 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-htg-indigo/10 flex items-center justify-center mb-3">
                <CalendarDays className="w-4 h-4 text-htg-indigo" />
              </div>
              <p className="font-semibold text-htg-fg group-hover:text-htg-indigo transition-colors">{pkg.name}</p>
              <p className="text-xs text-htg-fg-muted mt-1">{pkg.description || 'Miesięczny dostęp do sesji'}</p>
              {pkg.prices?.[0] && (
                <p className="text-sm font-medium text-htg-indigo mt-3">
                  {formatPrice(pkg.prices[0].amount, pkg.prices[0].currency, locale)} / mies.
                </p>
              )}
            </Link>
          );
        })()}

        {/* Pakiet roczny */}
        {packages.find(p => p.slug === PRODUCT_SLUGS.YEARLY) && (() => {
          const pkg = packages.find(p => p.slug === PRODUCT_SLUGS.YEARLY)!;
          return (
            <Link
              href="/sesje-indywidualne"
              className="bg-htg-card border border-htg-card-border rounded-xl p-5 hover:border-htg-indigo/40 transition-colors group relative overflow-hidden"
            >
              <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-htg-sage bg-htg-sage/10 px-2 py-0.5 rounded-full">
                Najlepsza opcja
              </span>
              <div className="w-9 h-9 rounded-lg bg-htg-sage/10 flex items-center justify-center mb-3">
                <Infinity className="w-4 h-4 text-htg-sage" />
              </div>
              <p className="font-semibold text-htg-fg group-hover:text-htg-indigo transition-colors">{pkg.name}</p>
              <p className="text-xs text-htg-fg-muted mt-1">{pkg.description || 'Roczny dostęp do sesji'}</p>
              {pkg.prices?.[0] && (
                <p className="text-sm font-medium text-htg-sage mt-3">
                  {formatPrice(pkg.prices[0].amount, pkg.prices[0].currency, locale)} / rok
                </p>
              )}
            </Link>
          );
        })()}
      </div>

      {/* Expired */}
      {expired.length > 0 && (
        <>
          <div className="border-t border-htg-card-border my-8" />
          <h3 className="text-sm font-semibold text-htg-fg-muted uppercase tracking-wider mb-3">Historia</h3>
          <div className="space-y-2">
            {expired.map((ent) => {
              const Icon = typeIcon(ent.type);
              return (
                <div key={ent.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4 flex items-center gap-3 opacity-60">
                  <Icon className="w-4 h-4 text-htg-fg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-htg-fg">
                      {ent.monthly_set?.title 
                        || (ent.scope_month ? formatSesjeMonthPl(ent.scope_month) : null) 
                        || ent.product?.name 
                        || typeLabel(ent, locale)}
                    </p>
                    <p className="text-xs text-htg-fg-muted">Wygasło: {formatDate(ent.valid_until, locale)}</p>
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-htg-surface text-htg-fg-muted">
                    Wygasła
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Manage via Stripe portal */}
      <div className="mt-8 pt-6 border-t border-htg-card-border">
        <a
          href="/api/stripe/portal"
          className="text-sm text-htg-fg-muted hover:text-htg-indigo transition-colors"
        >
          Zarządzaj subskrypcją (portal płatności) →
        </a>
      </div>
    </div>
  );
}
