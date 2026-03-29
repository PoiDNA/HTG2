import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { PostFeed } from '@/components/community/PostFeed';
import { GroupHeader } from '@/components/community/GroupHeader';
import type { CommunityGroup } from '@/lib/community/types';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = createSupabaseServiceRole();
  const { data: group } = await db
    .from('community_groups')
    .select('name, description')
    .eq('slug', slug)
    .single();

  const title = group?.name ?? 'Grupa';
  const description = group?.description ?? '';
  return {
    title,
    description,
    openGraph: { title: `${title} | HTG Społeczność`, description },
  };
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // Auth
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  const db = createSupabaseServiceRole();

  // Fetch group
  const { data: group } = await db
    .from('community_groups')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!group) {
    redirect(`/${locale}/spolecznosc`);
  }

  // Visibility check
  if (group.visibility === 'staff_only' && !isStaff) {
    redirect(`/${locale}/spolecznosc`);
  }

  // Fetch membership
  const { data: membership } = await db
    .from('community_memberships')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single();

  const isMember = !!membership || isAdmin || isStaff;

  // Private group: require membership
  if (group.visibility === 'private' && !isMember) {
    redirect(`/${locale}/spolecznosc`);
  }

  // Member count
  const { count: memberCount } = await db
    .from('community_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id);

  const canWrite = isMember;
  const canModerate = isAdmin || isStaff ||
    membership?.role === 'moderator' ||
    membership?.role === 'admin';

  return (
    <div>
      <GroupHeader
        group={group as CommunityGroup}
        memberCount={memberCount ?? 0}
        isMember={isMember}
        canModerate={canModerate}
        slug={slug}
      />

      <PostFeed
        groupId={group.id}
        currentUserId={user.id}
        canWrite={canWrite}
        canModerate={canModerate}
      />
    </div>
  );
}
