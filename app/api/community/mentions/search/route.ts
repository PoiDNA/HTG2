import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/mentions/search?q=anna&group_id=uuid
 *
 * Search for users to mention. Returns members of the given group.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || '';
  const groupId = req.nextUrl.searchParams.get('group_id');

  if (!groupId) {
    return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Get group members
  const { data: memberships } = await supabase
    .from('community_memberships')
    .select('user_id')
    .eq('group_id', groupId);

  const memberIds = (memberships ?? []).map(m => m.user_id);
  if (memberIds.length === 0) {
    return NextResponse.json([]);
  }

  // Search profiles by display_name
  let profileQuery = supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', memberIds)
    .neq('id', user.id) // Exclude self
    .limit(10);

  if (query.length > 0) {
    profileQuery = profileQuery.ilike('display_name', `%${query}%`);
  }

  const { data: profiles } = await profileQuery;

  const results: Array<{ id: string; label: string; avatar_url: string | null }> = [];

  // Add @all and @staff as special options (shown at top when query matches)
  if ('all'.includes(query.toLowerCase()) || 'wszys'.includes(query.toLowerCase())) {
    results.push({ id: 'all', label: 'all (wszyscy w grupie)', avatar_url: null });
  }
  if ('staff'.includes(query.toLowerCase()) || 'zespo'.includes(query.toLowerCase())) {
    results.push({ id: 'staff', label: 'staff (zespół HTG)', avatar_url: null });
  }

  // Add user results
  for (const p of profiles ?? []) {
    results.push({
      id: p.id,
      label: p.display_name || 'Anonim',
      avatar_url: p.avatar_url,
    });
  }

  return NextResponse.json(results);
}
