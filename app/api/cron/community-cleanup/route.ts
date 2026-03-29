import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { deleteFile } from '@/lib/bunny-storage';

/**
 * POST /api/cron/community-cleanup
 *
 * Cleanup orphaned community data:
 * 1. Hard-delete posts soft-deleted > 30 days ago (CASCADE to comments, reactions)
 * 2. Delete physical files from Bunny Storage for those posts
 * 3. Cleanup old rate limit log entries (> 7 days)
 * 4. Cleanup old read notifications (> 90 days)
 *
 * Intended to be called by Vercel Cron or manually.
 */
export async function POST() {
  const db = createSupabaseServiceRole();
  const results = { posts_deleted: 0, files_deleted: 0, rate_logs_cleaned: 0, notifications_cleaned: 0 };

  // 1. Find posts soft-deleted > 30 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiredPosts } = await db
    .from('community_posts')
    .select('id, attachments')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', thirtyDaysAgo)
    .limit(100); // Process in batches

  for (const post of expiredPosts ?? []) {
    // Delete physical files from Bunny Storage
    const attachments = (post.attachments as Array<{ url?: string; type?: string }>) ?? [];
    for (const att of attachments) {
      if (att.url && att.url.startsWith('community/')) {
        try {
          await deleteFile(att.url);
          results.files_deleted++;
        } catch (err) {
          console.error(`Failed to delete file ${att.url}:`, err);
        }
      }
    }

    // Also find and delete comment attachments
    const { data: comments } = await db
      .from('community_comments')
      .select('attachments')
      .eq('post_id', post.id);

    for (const comment of comments ?? []) {
      const commentAtts = (comment.attachments as Array<{ url?: string }>) ?? [];
      for (const att of commentAtts) {
        if (att.url && att.url.startsWith('community/')) {
          try {
            await deleteFile(att.url);
            results.files_deleted++;
          } catch (err) {
            console.error(`Failed to delete comment file ${att.url}:`, err);
          }
        }
      }
    }

    // Hard-delete post (CASCADE handles comments, reactions, mentions)
    await db.from('community_posts').delete().eq('id', post.id);
    results.posts_deleted++;
  }

  // 2. Cleanup old rate limit entries (> 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rateLogData } = await db
    .from('community_rate_log')
    .delete()
    .lt('created_at', sevenDaysAgo)
    .select('id');
  results.rate_logs_cleaned = rateLogData?.length ?? 0;

  // 3. Cleanup old read notifications (> 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: notifData } = await db
    .from('community_notifications')
    .delete()
    .eq('is_read', true)
    .lt('created_at', ninetyDaysAgo)
    .select('id');
  results.notifications_cleaned = notifData?.length ?? 0;

  return NextResponse.json(results);
}
