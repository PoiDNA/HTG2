import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n-config';
import type { ComponentProps } from 'react';
import { Users, MessageSquare, Lock, Globe, Shield, Archive, Flag, Plus, ExternalLink } from 'lucide-react';
import { CreateGroupForm } from '@/components/community/admin/CreateGroupForm';
import { GroupAdminRow } from '@/components/community/admin/GroupAdminRow';

export default async function AdminCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  // Auth check
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();
  const activeTab = sp.tab || 'groups';

  // Fetch groups with stats
  const { data: groups } = await db
    .from('community_groups')
    .select('*, community_memberships(count)')
    .order('created_at', { ascending: false });

  // Fetch post counts per group
  const groupIds = (groups ?? []).map(g => g.id);
  const { data: postCounts } = groupIds.length > 0
    ? await db
        .from('community_posts')
        .select('group_id')
        .in('group_id', groupIds)
        .is('deleted_at', null)
    : { data: [] };

  const postCountMap = new Map<string, number>();
  for (const p of postCounts ?? []) {
    postCountMap.set(p.group_id, (postCountMap.get(p.group_id) || 0) + 1);
  }

  // Fetch pending reports count
  const { count: pendingReportsCount } = await db
    .from('community_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Fetch total stats
  const { count: totalMembers } = await db
    .from('community_memberships')
    .select('id', { count: 'exact', head: true });

  const { count: totalPosts } = await db
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  const enrichedGroups = (groups ?? []).map(g => ({
    ...g,
    member_count: g.community_memberships?.[0]?.count ?? 0,
    post_count: postCountMap.get(g.id) ?? 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Społeczność — Panel admina</h1>
        <Link
          href="/spolecznosc"
          className="flex items-center gap-1 text-sm text-htg-sage hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          Przejdź do społeczności
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Grupy" value={enrichedGroups.length} icon={Users} />
        <StatCard label="Członkowie" value={totalMembers ?? 0} icon={Users} />
        <StatCard label="Posty" value={totalPosts ?? 0} icon={MessageSquare} />
        <StatCard
          label="Zgłoszenia"
          value={pendingReportsCount ?? 0}
          icon={Flag}
          highlight={!!pendingReportsCount && pendingReportsCount > 0}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-htg-card-border">
        <TabLink href={{pathname: '/konto/admin/spolecznosc', query: {tab: 'groups'}}} active={activeTab === 'groups'}>Grupy</TabLink>
        <TabLink href={{pathname: '/konto/admin/spolecznosc', query: {tab: 'create'}}} active={activeTab === 'create'}>Nowa grupa</TabLink>
        <TabLink href={{pathname: '/konto/admin/spolecznosc', query: {tab: 'reports'}}} active={activeTab === 'reports'}>
          Zgłoszenia {pendingReportsCount ? `(${pendingReportsCount})` : ''}
        </TabLink>
      </div>

      {/* Tab content */}
      {activeTab === 'groups' && (
        <div className="space-y-2">
          {enrichedGroups.length === 0 ? (
            <div className="text-center py-12 text-htg-fg-muted">
              Brak grup. Utwórz pierwszą grupę w zakładce &ldquo;Nowa grupa&rdquo;.
            </div>
          ) : (
            enrichedGroups.map(group => (
              <GroupAdminRow
                key={group.id}
                group={group}
                locale={locale}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <CreateGroupForm locale={locale} />
      )}

      {activeTab === 'reports' && (
        <ReportsSection />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, icon: Icon, highlight }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; highlight?: boolean;
}) {
  return (
    <div className={`bg-htg-card border rounded-xl p-4 ${highlight ? 'border-red-500/30' : 'border-htg-card-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${highlight ? 'text-red-500' : 'text-htg-fg-muted'}`} />
        <span className="text-xs text-htg-fg-muted">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${highlight ? 'text-red-500' : 'text-htg-fg'}`}>
        {value}
      </span>
    </div>
  );
}

function TabLink({ href, active, children }: { href: ComponentProps<typeof Link>['href']; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-htg-sage text-htg-sage'
          : 'border-transparent text-htg-fg-muted hover:text-htg-fg'
      }`}
    >
      {children}
    </Link>
  );
}

async function ReportsSection() {
  const db = createSupabaseServiceRole();

  const { data: reports } = await db
    .from('community_reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!reports?.length) {
    return (
      <div className="text-center py-12 text-htg-fg-muted">
        Brak oczekujących zgłoszeń.
      </div>
    );
  }

  // Get reporter profiles
  const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
  const { data: profiles } = await db
    .from('profiles')
    .select('id, display_name, email')
    .in('id', reporterIds);
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-htg-surface text-left">
            <th className="px-4 py-3 font-medium text-htg-fg-muted">Zgłaszający</th>
            <th className="px-4 py-3 font-medium text-htg-fg-muted">Typ</th>
            <th className="px-4 py-3 font-medium text-htg-fg-muted">Powód</th>
            <th className="px-4 py-3 font-medium text-htg-fg-muted">Data</th>
            <th className="px-4 py-3 font-medium text-htg-fg-muted">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {reports.map(r => {
            const reporter = profileMap.get(r.reporter_id);
            return (
              <tr key={r.id} className="border-t border-htg-card-border hover:bg-htg-surface/50">
                <td className="px-4 py-3">{reporter?.display_name || reporter?.email || 'Anonim'}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-htg-surface">
                    {r.target_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-htg-fg-muted max-w-xs truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3 text-htg-fg-muted">
                  {new Date(r.created_at).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-4 py-3">
                  <ReportActions reportId={r.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReportActions({ reportId }: { reportId: string }) {
  return (
    <div className="flex gap-1">
      <form action={async () => {
        'use server';
        const db = createSupabaseServiceRole();
        await db.from('community_reports').update({ status: 'reviewed', reviewed_at: new Date().toISOString() }).eq('id', reportId);
      }}>
        <button type="submit" className="px-2 py-1 text-xs bg-htg-sage/10 text-htg-sage rounded hover:bg-htg-sage/20">
          Przejrzany
        </button>
      </form>
      <form action={async () => {
        'use server';
        const db = createSupabaseServiceRole();
        await db.from('community_reports').update({ status: 'dismissed', reviewed_at: new Date().toISOString() }).eq('id', reportId);
      }}>
        <button type="submit" className="px-2 py-1 text-xs bg-htg-surface text-htg-fg-muted rounded hover:bg-htg-card-border">
          Odrzuć
        </button>
      </form>
    </div>
  );
}
