import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/community/onboarding
 *
 * Auto-join a user to all groups with auto_join=true.
 * Called after user registration/first login.
 * Body: { user_id }
 */
export async function POST(req: NextRequest) {
  const { user_id } = await req.json();

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Get all auto-join groups
  const { data: groups } = await db
    .from('community_groups')
    .select('id')
    .eq('auto_join', true)
    .eq('is_archived', false);

  if (!groups?.length) {
    return NextResponse.json({ joined: 0 });
  }

  // Get existing memberships to avoid duplicates
  const { data: existing } = await db
    .from('community_memberships')
    .select('group_id')
    .eq('user_id', user_id)
    .in('group_id', groups.map(g => g.id));

  const existingGroupIds = new Set((existing ?? []).map(e => e.group_id));
  const toJoin = groups.filter(g => !existingGroupIds.has(g.id));

  if (toJoin.length === 0) {
    return NextResponse.json({ joined: 0 });
  }

  const memberships = toJoin.map(g => ({
    group_id: g.id,
    user_id,
    role: 'member' as const,
  }));

  await db.from('community_memberships').insert(memberships);

  return NextResponse.json({ joined: toJoin.length });
}
