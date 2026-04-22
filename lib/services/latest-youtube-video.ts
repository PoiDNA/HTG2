import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * Fetch the latest YouTube playlist video for the given locale.
 * Falls back to PL if no video exists in the user's locale.
 */
export async function getLatestYoutubeVideo(locale: string) {
  const db = createSupabaseServiceRole();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await db
    .from('youtube_videos')
    .select('youtube_id, title, thumbnail_url')
    .eq('source', 'playlist')
    .eq('content_locale', locale)
    .gte('published_at', sevenDaysAgo)
    .order('published_at', { ascending: false })
    .order('youtube_id')
    .limit(1)
    .maybeSingle();

  if (data) return data;

  if (locale !== 'pl') {
    const { data: fallback } = await db
      .from('youtube_videos')
      .select('youtube_id, title, thumbnail_url')
      .eq('source', 'playlist')
      .eq('content_locale', 'pl')
      .gte('published_at', sevenDaysAgo)
      .order('published_at', { ascending: false })
      .order('youtube_id')
      .limit(1)
      .maybeSingle();
    return fallback;
  }

  return null;
}

/**
 * Fetch the N latest YouTube playlist videos for a given locale.
 * Used on the public homepage. Falls back to PL locale.
 */
export async function getLatestYoutubeVideos(
  locale: string,
  count = 3,
): Promise<Array<{ youtube_id: string; title: string; thumbnail_url: string }>> {
  const db = createSupabaseServiceRole();

  const query = (loc: string) =>
    db
      .from('youtube_videos')
      .select('youtube_id, title, thumbnail_url')
      .eq('source', 'playlist')
      .eq('content_locale', loc)
      .order('published_at', { ascending: false })
      .limit(count);

  const { data } = await query(locale);
  if (data && data.length > 0) return data;

  if (locale !== 'pl') {
    const { data: fallback } = await query('pl');
    return fallback ?? [];
  }

  return [];
}
