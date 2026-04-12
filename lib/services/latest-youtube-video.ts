import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * Fetch the latest YouTube playlist video for the given locale.
 * Falls back to PL if no video exists in the user's locale.
 * Uses service role — RLS only allows is_visible=true reads,
 * but playlist videos are inserted with is_visible=false.
 */
export async function getLatestYoutubeVideo(locale: string) {
  const db = createSupabaseServiceRole();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Try user's locale first
  const { data } = await db
    .from('youtube_videos')
    .select('youtube_id, title, thumbnail_url')
    .eq('source', 'playlist')
    .eq('content_locale', locale)
    .gte('discovered_at', threeDaysAgo)
    .order('discovered_at', { ascending: false })
    .order('youtube_id')
    .limit(1)
    .maybeSingle();

  if (data) return data;

  // 2. Fallback to PL
  if (locale !== 'pl') {
    const { data: fallback } = await db
      .from('youtube_videos')
      .select('youtube_id, title, thumbnail_url')
      .eq('source', 'playlist')
      .eq('content_locale', 'pl')
      .gte('discovered_at', threeDaysAgo)
      .order('discovered_at', { ascending: false })
      .order('youtube_id')
      .limit(1)
      .maybeSingle();
    return fallback;
  }

  return null;
}
