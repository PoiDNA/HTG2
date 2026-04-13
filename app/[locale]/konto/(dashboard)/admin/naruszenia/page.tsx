import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from '@/i18n-config';
import { Link } from '@/i18n-config';
import {
  AlertTriangle, ShieldAlert, Info, CheckCircle,
  ExternalLink, User, Clock, Globe, Wifi,
} from 'lucide-react';
import { BlockUserButton } from '@/components/admin/BlockUserButton';
import { ResolveFlagButton } from '@/components/admin/ResolveFlagButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const FLAG_LABELS: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  ip_diversity:          { label: 'Wiele IP', icon: Wifi,         description: 'Konto używane z wielu adresów IP — możliwe udostępnianie' },
  high_frequency:        { label: 'Wysoka częstotliwość', icon: Clock,   description: 'Zbyt wiele odtworzeń tej samej sesji' },
  concurrent_countries:  { label: 'Różne kraje', icon: Globe,       description: 'Równoczesne odtwarzanie z różnych krajów — możliwe współdzielenie' },
  mass_play:             { label: 'Masowe odtwarzanie', icon: AlertTriangle, description: 'Duża liczba odtworzeń w ciągu jednego dnia' },
  manual:                { label: 'Ręczna flaga', icon: ShieldAlert, description: 'Flaga ustawiona ręcznie przez administratora' },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-900/30 text-red-400 border-red-800/30',
  warning:  'bg-yellow-900/30 text-yellow-400 border-yellow-800/30',
  info:     'bg-blue-900/30 text-blue-400 border-blue-800/30',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Krytyczne',
  warning:  'Ostrzeżenie',
  info:     'Informacja',
};

export default async function NaruszeniaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; userId?: string }>;
}) {
  const { locale } = await params;
  const { filter = 'unresolved', userId } = await searchParams;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect({href: '/konto', locale});

  const db = createSupabaseServiceRole();

  // ── Fetch flags ─────────────────────────────────────────────────────────
  let flagQuery = db
    .from('user_flags')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter === 'unresolved') flagQuery = flagQuery.eq('resolved', false);
  if (filter === 'critical')   flagQuery = flagQuery.eq('severity', 'critical').eq('resolved', false);
  if (userId)                  flagQuery = flagQuery.eq('user_id', userId);

  const { data: flags } = await flagQuery;

  // ── Fetch user profiles for flagged users ─────────────────────────────
  const userIds = [...new Set((flags || []).map((f: any) => f.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name, is_blocked, blocked_at, blocked_reason').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // ── Per-user play history (last 20 events) for detail view ──────────
  let playHistory: any[] = [];
  if (userId) {
    const { data: history } = await db
      .from('play_events')
      .select('id, session_id, session_type, ip_address, country_code, started_at, ended_at, play_duration_seconds, device_id')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(50);
    playHistory = history || [];
  }

  // ── Stats ───────────────────────────────────────────────────────────
  const { count: totalUnresolved } = await db
    .from('user_flags').select('*', { count: 'exact', head: true }).eq('resolved', false);
  const { count: totalCritical } = await db
    .from('user_flags').select('*', { count: 'exact', head: true }).eq('resolved', false).eq('severity', 'critical');
  const { count: totalBlocked } = await db
    .from('profiles').select('*', { count: 'exact', head: true }).eq('is_blocked', true);

  const flagList = flags || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-400" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Naruszenia i bezpieczeństwo</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Otwarte flagi', value: totalUnresolved ?? 0, color: 'text-yellow-400' },
          { label: 'Krytyczne', value: totalCritical ?? 0, color: 'text-red-400' },
          { label: 'Zablokowane konta', value: totalBlocked ?? 0, color: 'text-htg-fg-muted' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-htg-card border border-htg-card-border rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-htg-fg-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'unresolved', label: 'Nierozwiązane' },
          { key: 'critical',   label: 'Krytyczne' },
          { key: 'all',        label: 'Wszystkie' },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={{pathname: '/konto/admin/naruszenia', query: {filter: key}}}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-htg-indigo text-white'
                : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* User play history (when userId filter active) */}
      {userId && playHistory.length > 0 && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-htg-fg flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Historia odtworzeń — {(profileMap.get(userId) as any)?.email || userId.slice(0, 8)}
            </h3>
            <Link
              href={{pathname: '/konto/admin/naruszenia', query: {filter}}}
              className="text-xs text-htg-fg-muted hover:text-htg-fg transition-colors"
            >
              ✕ Zamknij historię
            </Link>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {playHistory.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-htg-card-border last:border-0">
                <span className="text-htg-fg-muted w-32 shrink-0">
                  {new Date(e.started_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-htg-fg font-mono truncate flex-1">{e.session_id.slice(0, 16)}…</span>
                <span className="text-htg-fg-muted shrink-0">{e.country_code || '—'}</span>
                <span className="text-htg-fg-muted shrink-0 font-mono">{e.ip_address?.slice(0, 15) || '—'}</span>
                <span className="text-htg-fg-muted shrink-0">
                  {e.play_duration_seconds ? `${Math.round(e.play_duration_seconds / 60)}min` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags list */}
      {flagList.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-12 text-center">
          <CheckCircle className="w-12 h-12 text-htg-sage mx-auto mb-4 opacity-50" />
          <p className="text-htg-fg-muted">Brak flag w tym widoku</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flagList.map((flag: any) => {
            const profile = profileMap.get(flag.user_id) as any;
            const flagMeta = FLAG_LABELS[flag.flag_type] || FLAG_LABELS.manual;
            const FlagIcon = flagMeta.icon;
            const details = flag.details || {};

            return (
              <div key={flag.id} className={`rounded-xl border p-4 ${flag.resolved ? 'opacity-50' : ''} bg-htg-card border-htg-card-border`}>
                <div className="flex items-start gap-4">
                  {/* Severity badge */}
                  <span className={`mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${SEVERITY_STYLES[flag.severity]}`}>
                    {SEVERITY_LABELS[flag.severity]}
                  </span>

                  {/* Flag details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FlagIcon className="w-4 h-4 text-htg-fg-muted shrink-0" />
                      <span className="font-semibold text-htg-fg text-sm">{flagMeta.label}</span>
                      <span className="text-xs text-htg-fg-muted">—</span>
                      <span className="text-xs text-htg-fg-muted">{flagMeta.description}</span>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <User className="w-3.5 h-3.5 text-htg-fg-muted shrink-0" />
                      <span className="text-sm text-htg-fg">
                        {profile?.display_name || profile?.email || flag.user_id.slice(0, 12)}
                      </span>
                      {profile?.is_blocked && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">ZABLOKOWANY</span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-htg-fg-muted">
                      {details.count     && <span>IPs: <strong className="text-htg-fg">{details.count}</strong></span>}
                      {details.ips       && <span>Adresy: <strong className="text-htg-fg">{(details.ips as string[]).slice(0, 3).join(', ')}{details.ips.length > 3 ? '…' : ''}</strong></span>}
                      {details.play_count && <span>Odtworzenia: <strong className="text-htg-fg">{details.play_count}</strong></span>}
                      {details.countries  && <span>Kraje: <strong className="text-htg-fg">{(details.countries as string[]).join(', ')}</strong></span>}
                      {details.play_count_today && <span>Dziś: <strong className="text-htg-fg">{details.play_count_today} odtworzeń</strong></span>}
                      <span className="ml-auto text-htg-fg-muted">
                        {new Date(flag.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {!flag.resolved && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={{pathname: '/konto/admin/naruszenia', query: {filter, userId: flag.user_id}}}
                        className="p-2 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-fg transition-colors"
                        title="Historia odtworzeń"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>

                      <ResolveFlagButton flagId={flag.id} />

                      {!profile?.is_blocked && (
                        <BlockUserButton
                          userId={flag.user_id}
                          userEmail={profile?.email || flag.user_id}
                        />
                      )}
                    </div>
                  )}

                  {flag.resolved && (
                    <span className="text-xs text-htg-fg-muted shrink-0 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-htg-sage" />
                      Zamknięta
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
