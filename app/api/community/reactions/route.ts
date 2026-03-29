import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';
import { checkCommunityRateLimit, logCommunityAction } from '@/lib/community/rate-limit';
import { notifyReaction } from '@/lib/community/notifications';

/**
 * POST /api/community/reactions
 *
 * Toggle a reaction. If reaction exists, remove it. If not, create it.
 * Body: { target_type: 'post'|'comment', target_id: uuid }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { target_type, target_id, reaction_type = 'heart' } = body;

  const VALID_REACTIONS = ['heart', 'thumbs_up', 'pray', 'wow', 'sad'];
  if (!target_type || !target_id || !['post', 'comment'].includes(target_type)) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 });
  }
  if (!VALID_REACTIONS.includes(reaction_type)) {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from('community_reactions')
    .select('id')
    .eq('user_id', user.id)
    .eq('target_type', target_type)
    .eq('target_id', target_id)
    .single();

  if (existing) {
    // Remove reaction (toggle off)
    await supabase
      .from('community_reactions')
      .delete()
      .eq('id', existing.id);

    return NextResponse.json({ action: 'removed' });
  }

  // Rate limit (only for adding, not removing)
  const rateLimited = await checkCommunityRateLimit(user.id, 'reaction');
  if (rateLimited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Max 120 reactions per hour.' }, { status: 429 });
  }

  // Create reaction
  const { error } = await supabase
    .from('community_reactions')
    .insert({
      user_id: user.id,
      target_type,
      target_id,
      reaction_type,
    });

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
      return NextResponse.json({ action: 'already_exists' });
    }
    return NextResponse.json({ error: 'Failed to create reaction' }, { status: 500 });
  }

  await logCommunityAction(user.id, 'reaction');

  // Notify the target owner
  let targetOwnerId: string | null = null;
  let groupId: string | null = null;

  if (target_type === 'post') {
    const { data: post } = await supabase
      .from('community_posts')
      .select('user_id, group_id')
      .eq('id', target_id)
      .single();
    targetOwnerId = post?.user_id ?? null;
    groupId = post?.group_id ?? null;
  } else {
    const { data: comment } = await supabase
      .from('community_comments')
      .select('user_id, group_id')
      .eq('id', target_id)
      .single();
    targetOwnerId = comment?.user_id ?? null;
    groupId = comment?.group_id ?? null;
  }

  if (targetOwnerId && groupId) {
    await notifyReaction({
      targetOwnerId,
      reactorId: user.id,
      targetType: target_type,
      targetId: target_id,
      groupId,
    });
  }

  return NextResponse.json({ action: 'added' }, { status: 201 });
}

/**
 * GET /api/community/reactions?target_type=&target_id=
 *
 * List users who reacted to a target.
 */
export async function GET(req: NextRequest) {
  const targetType = req.nextUrl.searchParams.get('target_type');
  const targetId = req.nextUrl.searchParams.get('target_id');

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase } = auth;

  const { data: reactions } = await supabase
    .from('community_reactions')
    .select('user_id, reaction_type, created_at')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch profiles
  const userIds = (reactions ?? []).map(r => r.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  return NextResponse.json(
    (reactions ?? []).map(r => ({
      ...r,
      profile: profileMap.get(r.user_id) ?? null,
    }))
  );
}
