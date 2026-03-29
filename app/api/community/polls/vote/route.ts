import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth, requireGroupAccess } from '@/lib/community/auth';

/**
 * POST /api/community/polls/vote
 *
 * Vote in a poll. One vote per user per poll.
 * Body: { post_id, option_index }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { post_id, option_index } = body;

  if (!post_id || option_index === undefined || option_index === null) {
    return NextResponse.json({ error: 'post_id and option_index are required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Fetch post to verify it has a poll and get group_id
  const { data: post } = await supabase
    .from('community_posts')
    .select('group_id, attachments')
    .eq('id', post_id)
    .is('deleted_at', null)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Verify group access
  const groupAuth = await requireGroupAccess(post.group_id, { requireWrite: true });
  if ('error' in groupAuth) return groupAuth.error;

  // Find poll attachment
  const attachments = (post.attachments ?? []) as Array<{ type: string; metadata?: { options?: string[]; multiple?: boolean } }>;
  const poll = attachments.find(a => a.type === 'poll');

  if (!poll) {
    return NextResponse.json({ error: 'Post does not contain a poll' }, { status: 400 });
  }

  const optionsCount = poll.metadata?.options?.length ?? 0;
  if (option_index < 0 || option_index >= optionsCount) {
    return NextResponse.json({ error: 'Invalid option index' }, { status: 400 });
  }

  // Upsert vote (allows changing vote)
  const { error: voteError } = await supabase
    .from('community_poll_votes')
    .upsert({
      post_id,
      user_id: user.id,
      option_index,
    }, {
      onConflict: 'post_id,user_id',
    });

  if (voteError) {
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
  }

  // Fetch updated vote counts
  const { data: votes } = await supabase
    .from('community_poll_votes')
    .select('option_index')
    .eq('post_id', post_id);

  const voteCounts: Record<number, number> = {};
  for (const v of votes ?? []) {
    voteCounts[v.option_index] = (voteCounts[v.option_index] || 0) + 1;
  }

  return NextResponse.json({
    vote_counts: voteCounts,
    total_votes: (votes ?? []).length,
    user_vote: option_index,
  });
}

/**
 * GET /api/community/polls/vote?post_id=
 *
 * Get poll results and current user's vote.
 */
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post_id');
  if (!postId) {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  // Get all votes
  const { data: votes } = await supabase
    .from('community_poll_votes')
    .select('option_index, user_id')
    .eq('post_id', postId);

  const voteCounts: Record<number, number> = {};
  let userVote: number | null = null;

  for (const v of votes ?? []) {
    voteCounts[v.option_index] = (voteCounts[v.option_index] || 0) + 1;
    if (v.user_id === user.id) userVote = v.option_index;
  }

  return NextResponse.json({
    vote_counts: voteCounts,
    total_votes: (votes ?? []).length,
    user_vote: userVote,
  });
}
