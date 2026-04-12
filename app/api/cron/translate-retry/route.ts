import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { translatePost, translateComment } from '@/lib/community/translate';

/**
 * GET /api/cron/translate-retry
 *
 * Retry failed or stale community translations.
 * Called by Vercel Cron every 5 minutes.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Find failed or stuck post translations
  const { data: failedPosts } = await db
    .from('community_post_translations')
    .select('post_id, locale')
    .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${twoMinutesAgo})`)
    .limit(10);

  // Find failed or stuck comment translations
  const { data: failedComments } = await db
    .from('community_comment_translations')
    .select('comment_id, locale')
    .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${twoMinutesAgo})`)
    .limit(10);

  let retriedPosts = 0;
  let retriedComments = 0;

  // Retry posts — group by post_id to get source_locale
  if (failedPosts && failedPosts.length > 0) {
    const postIds = [...new Set(failedPosts.map(f => f.post_id))];
    const { data: posts } = await db
      .from('community_posts')
      .select('id, source_locale')
      .in('id', postIds);

    for (const post of (posts ?? [])) {
      if (!post.source_locale) continue;
      try {
        await translatePost(post.id, post.source_locale);
        retriedPosts++;
      } catch (err) {
        console.error(`Retry failed for post ${post.id}:`, err);
      }
    }
  }

  // Retry comments
  if (failedComments && failedComments.length > 0) {
    const commentIds = [...new Set(failedComments.map(f => f.comment_id))];
    const { data: comments } = await db
      .from('community_comments')
      .select('id, source_locale')
      .in('id', commentIds);

    for (const comment of (comments ?? [])) {
      if (!comment.source_locale) continue;
      try {
        await translateComment(comment.id, comment.source_locale);
        retriedComments++;
      } catch (err) {
        console.error(`Retry failed for comment ${comment.id}:`, err);
      }
    }
  }

  return NextResponse.json({
    retried_posts: retriedPosts,
    retried_comments: retriedComments,
    failed_posts: failedPosts?.length ?? 0,
    failed_comments: failedComments?.length ?? 0,
  });
}
