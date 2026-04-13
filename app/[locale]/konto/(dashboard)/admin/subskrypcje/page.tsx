import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { CreditCard, User, CheckCircle, XCircle } from 'lucide-react';
import { Link } from '@/i18n-config';
import SubscriptionsClient from './SubscriptionsClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// ─── Types ──────────────────────────────────────────────────────────────────

import { formatSesjeMonthPl } from '@/lib/booking/constants';

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  wix_member_id: string | null;
  created_at: string;
};

type Entitlement = {
  id: string;
  user_id: string;
  type: string;
  scope_month: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  source: string | null;
  created_at: string;
  monthly_set_id: string | null;
  stripe_subscription_id: string | null;
  monthly_set: { title: string } | null;
};

export type SubscriptionGroup = {
  type: 'monthly' | 'yearly';
  label: string;
  start_month: string;
  end_month: string;
  months: string[];
  source: string;
  entitlementIds: string[];
  is_active: boolean;
  isApproximate?: boolean;
};

// ─── Group consecutive entitlements into logical subscriptions ───────────────

function groupEntitlements(entitlements: Entitlement[]): SubscriptionGroup[] {
  const yearly = [...entitlements.filter((e) => e.type === 'yearly' && e.scope_month)]
    .sort((a, b) => (a.scope_month ?? '').localeCompare(b.scope_month ?? ''));
  const monthly = [...entitlements.filter((e) => e.type === 'monthly' && e.scope_month)]
    .sort((a, b) => (b.scope_month ?? '').localeCompare(a.scope_month ?? ''));

  const groups: SubscriptionGroup[] = [];

  // Yearly: group by stripe_subscription_id or consecutive scope_month + source
  let i = 0;
  while (i < yearly.length) {
    const startEnt = yearly[i];
    const block: Entitlement[] = [startEnt];
    let isApproximate = false;
    let j = i + 1;

    if (startEnt.stripe_subscription_id) {
      // Group by stripe_subscription_id
      while (j < yearly.length && yearly[j].stripe_subscription_id === startEnt.stripe_subscription_id) {
        block.push(yearly[j]);
        j++;
      }
    } else {
      // Fallback grouping for non-stripe sources
      isApproximate = true;
      while (j < yearly.length && block.length < 12) {
        const prev = block[block.length - 1].scope_month!;
        const curr = yearly[j].scope_month!;
        const sameSource = yearly[j].source === startEnt.source;
        
        // Check if consecutive months
        const [py, pm] = prev.split('-').map(Number);
        const [cy, cm] = curr.split('-').map(Number);
        const isConsecutive = cy * 12 + cm === py * 12 + pm + 1;
        
        if (sameSource && isConsecutive && !yearly[j].stripe_subscription_id) {
          block.push(yearly[j]);
          j++;
        } else {
          break;
        }
      }
    }

    groups.push({
      type: 'yearly',
      label: `${formatSesjeMonthPl(block[0].scope_month!)} → ${formatSesjeMonthPl(block[block.length - 1].scope_month!)}`,
      start_month: block[0].scope_month!,
      end_month: block[block.length - 1].scope_month!,
      months: block.map((e) => e.scope_month!),
      source: block[0].source ?? 'manual',
      entitlementIds: block.map((e) => e.id),
      is_active: block.some((e) => e.is_active),
      isApproximate,
    });
    i = j;
  }

  // Monthly: each is its own purchase
  for (const e of monthly) {
    groups.push({
      type: 'monthly',
      label: e.monthly_set?.title || formatSesjeMonthPl(e.scope_month!),
      start_month: e.scope_month!,
      end_month: e.scope_month!,
      months: [e.scope_month!],
      source: e.source ?? 'manual',
      entitlementIds: [e.id],
      is_active: e.is_active,
    });
  }

  return groups.sort((a, b) => b.start_month.localeCompare(a.start_month));
}

const sourceBadge: Record<string, string> = {
  wix:    'bg-purple-500/20 text-purple-400',
  manual: 'bg-htg-sage/20 text-htg-sage',
  stripe: 'bg-blue-500/20 text-blue-400',
  migration: 'bg-amber-500/20 text-amber-400',
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function AdminSubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string; filter?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect(`/${locale}/konto`);

  const supabase = createSupabaseServiceRole();

  const pageSize = 50;
  const page = Math.max(1, parseInt(sp.page ?? '1'));
  const offset = (page - 1) * pageSize;
  const q = sp.q ?? '';
  const filter = sp.filter ?? 'all'; // all | with_sub | no_sub

  // ── profiles ──────────────────────────────────────────────────────────────
  let profilesQuery = supabase
    .from('profiles')
    .select('id, email, display_name, wix_member_id, created_at', { count: 'exact' })
    .order('email', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (q) profilesQuery = profilesQuery.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);

  const { data: profiles, count } = await profilesQuery;
  const userIds = (profiles ?? []).map((p: Profile) => p.id);

  // ── entitlements ──────────────────────────────────────────────────────────
  const { data: rawEntitlements } = userIds.length
    ? await supabase
        .from('entitlements')
        .select('id, user_id, type, scope_month, valid_from, valid_until, is_active, source, created_at, monthly_set_id, stripe_subscription_id, monthly_set:monthly_sets(title)')
        .in('user_id', userIds)
        .order('scope_month', { ascending: true })
    : { data: [] };

  // Group by user
  const entByUser = new Map<string, Entitlement[]>();
  for (const e of (rawEntitlements ?? []) as unknown as Entitlement[]) {
    const arr = entByUser.get(e.user_id) ?? [];
    arr.push(e);
    entByUser.set(e.user_id, arr);
  }

  // Stats
  const totalUsers = count ?? 0;
  const usersWithSub = [...entByUser.values()].filter((arr) => arr.some((e) => e.is_active)).length;

  // Apply filter
  const filteredProfiles = (profiles ?? []).filter((p: Profile) => {
    if (filter === 'with_sub') return entByUser.has(p.id) && (entByUser.get(p.id) ?? []).some(e => e.is_active);
    if (filter === 'no_sub')   return !entByUser.has(p.id) || !(entByUser.get(p.id) ?? []).some(e => e.is_active);
    return true;
  }) as Profile[];

  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-htg-sage" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Subskrypcje</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Wszyscy użytkownicy</p>
          <p className="text-2xl font-bold text-htg-fg">{totalUsers}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Z aktywną subskrypcją</p>
          <p className="text-2xl font-bold text-htg-sage">{usersWithSub}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Bez subskrypcji</p>
          <p className="text-2xl font-bold text-htg-fg-muted">{totalUsers - usersWithSub}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Na tej stronie</p>
          <p className="text-2xl font-bold text-htg-fg">{filteredProfiles.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <input
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Szukaj po email lub nazwie…"
            className="flex-1 px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:border-htg-sage"
          />
          <select
            name="filter"
            defaultValue={filter}
            className="px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg"
          >
            <option value="all">Wszyscy</option>
            <option value="with_sub">Z subskrypcją</option>
            <option value="no_sub">Bez subskrypcji</option>
          </select>
          <button
            type="submit"
            className="px-5 py-2 bg-htg-sage hover:bg-htg-sage-dark text-white rounded-lg text-sm font-medium transition-colors"
          >
            Szukaj
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-htg-card-border bg-htg-surface">
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Użytkownik</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Subskrypcje</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium hidden sm:table-cell">Data rejestracji</th>
                <th className="text-center py-3 px-4 text-htg-fg-muted font-medium">Dodaj</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((u) => {
                const ents = entByUser.get(u.id) ?? [];
                const groups = groupEntitlements(ents);
                const hasActive = groups.some((g) => g.is_active);

                return (
                  <tr key={u.id} className="border-b border-htg-card-border last:border-0 hover:bg-htg-surface/40 align-top">
                    {/* User */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-htg-fg-muted flex-shrink-0" />
                        <div>
                          <p className="text-htg-fg font-medium">{u.display_name || '—'}</p>
                          <p className="text-htg-fg-muted text-xs">{u.email || '—'}</p>
                          {u.wix_member_id && (
                            <span className="text-[10px] text-purple-400">WIX</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Subscriptions */}
                    <td className="py-3 px-4">
                      {groups.length === 0 ? (
                        <span className="text-htg-fg-muted text-xs">Brak</span>
                      ) : (
                        <div className="space-y-1.5">
                          {groups.map((g, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5">
                              {/* Active/inactive */}
                              {g.is_active
                                ? <CheckCircle className="w-3.5 h-3.5 text-htg-sage flex-shrink-0" />
                                : <XCircle className="w-3.5 h-3.5 text-htg-fg-muted/50 flex-shrink-0" />
                              }
                              {/* Type badge */}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                                ${g.type === 'yearly' ? 'bg-htg-sage/20 text-htg-sage' : 'bg-htg-indigo/30 text-htg-cream/80'}`}>
                                {g.type === 'yearly' ? 'Roczna' : 'Miesięczna'}
                              </span>
                              {/* Range */}
                              <span className="text-htg-fg text-xs">
                                {g.label}
                                {g.isApproximate && <span className="text-[10px] text-htg-fg-muted ml-1" title="Zgrupowane automatycznie"> (przybliżone)</span>}
                              </span>
                              {/* Source */}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${sourceBadge[g.source] ?? sourceBadge.manual}`}>
                                {g.source}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Reg date */}
                    <td className="py-3 px-4 text-htg-fg-muted text-xs hidden sm:table-cell whitespace-nowrap">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('pl') : '—'}
                    </td>

                    {/* Add */}
                    <td className="py-3 px-4 text-center">
                      <SubscriptionsClient userId={u.id} userEmail={u.email ?? u.id} />
                    </td>
                  </tr>
                );
              })}

              {filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-htg-fg-muted text-sm">
                    Brak wyników
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-htg-card-border">
            <p className="text-xs text-htg-fg-muted">
              Strona {page} z {totalPages} ({totalUsers} użytkowników)
            </p>
            <div className="flex gap-1">
              {page > 1 && (
                <Link
                  href={{pathname: '/konto/admin/subskrypcje', query: {page: String(page - 1), ...(q ? {q} : {}), ...(filter !== 'all' ? {filter} : {})}}}
                  className="px-3 py-1 bg-htg-surface rounded text-xs text-htg-fg hover:bg-htg-card-border"
                >
                  ← Poprz.
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{pathname: '/konto/admin/subskrypcje', query: {page: String(page + 1), ...(q ? {q} : {}), ...(filter !== 'all' ? {filter} : {})}}}
                  className="px-3 py-1 bg-htg-surface rounded text-xs text-htg-fg hover:bg-htg-card-border"
                >
                  Nast. →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
