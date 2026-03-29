import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { GroupCard } from '@/components/community/GroupCard';
import { PushConsentBanner } from '@/components/community/PushConsentBanner';
import { Users2, Plus, Bookmark } from 'lucide-react';
import { Link } from '@/i18n-config';
import type { GroupWithMeta } from '@/lib/community/types';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Community' });
  return {
    title: t('title'),
    description: t('meta_description'),
    openGraph: { title: t('title'), description: t('meta_description') },
  };
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Community' });

  // Auth
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  // Fetch groups via API (uses same logic)
  const db = createSupabaseServiceRole();

  // Get memberships
  const { data: memberships } = await db
    .from('community_memberships')
    .select('group_id, role')
    .eq('user_id', user.id);

  const memberGroupIds = (memberships ?? []).map(m => m.group_id);

  // Fetch groups
  let query = db
    .from('community_groups')
    .select('*, community_memberships(count)')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  if (!isStaff) {
    query = query.or(
      `visibility.eq.public${memberGroupIds.length > 0 ? `,id.in.(${memberGroupIds.join(',')})` : ''}`
    );
  }

  const { data: groups } = await query;

  // Get last activity
  const groupIds = (groups ?? []).map(g => g.id);
  const { data: lastPosts } = groupIds.length > 0
    ? await db
        .from('community_posts')
        .select('group_id, last_activity_at')
        .in('group_id', groupIds)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false })
    : { data: [] };

  const lastPostMap = new Map<string, string>();
  for (const post of lastPosts ?? []) {
    if (!lastPostMap.has(post.group_id)) {
      lastPostMap.set(post.group_id, post.last_activity_at);
    }
  }

  const membershipMap = new Map(
    (memberships ?? []).map(m => [m.group_id, m.role])
  );

  const enrichedGroups: GroupWithMeta[] = (groups ?? []).map(group => ({
    ...group,
    member_count: group.community_memberships?.[0]?.count ?? 0,
    is_member: membershipMap.has(group.id) || isAdmin || isStaff,
    membership_role: membershipMap.get(group.id) ?? null,
    last_post_at: lastPostMap.get(group.id) ?? null,
    community_memberships: undefined,
  }));

  // Split into "my groups" and "discover"
  const myGroups = enrichedGroups.filter(g => g.is_member);
  const discoverGroups = enrichedGroups.filter(g => !g.is_member && g.visibility === 'public');

  return (
    <div>
      <PushConsentBanner />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-serif font-bold text-htg-fg">
          {t('title')}
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/spolecznosc/zapisane" className="flex items-center gap-1 text-sm text-htg-fg-muted hover:text-htg-warm transition-colors">
            <Bookmark className="w-4 h-4" />
            <span className="hidden sm:inline">Zapisane</span>
          </Link>
          {isAdmin && (
            <Link href="/konto/admin/spolecznosc" className="text-xs text-htg-sage hover:underline">
              Zarządzaj →
            </Link>
          )}
        </div>
      </div>

      {/* My groups */}
      {myGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-htg-fg mb-3 flex items-center gap-2">
            <Users2 className="w-5 h-5 text-htg-sage" />
            {t('my_groups')}
          </h2>
          <div className="space-y-2">
            {myGroups.map(group => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        </section>
      )}

      {/* Discover groups */}
      {discoverGroups.length > 0 && (
        <section>
          <h2 className="text-lg font-serif font-semibold text-htg-fg mb-3 flex items-center gap-2">
            <Plus className="w-5 h-5 text-htg-sage" />
            {t('discover')}
          </h2>
          <div className="space-y-2">
            {discoverGroups.map(group => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {myGroups.length === 0 && discoverGroups.length === 0 && (
        <div className="text-center py-12">
          <Users2 className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">
            {t('no_groups')}
          </p>
        </div>
      )}
    </div>
  );
}
