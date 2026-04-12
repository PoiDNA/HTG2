import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PLAYLIST_LOCALES = ['pl', 'en', 'de', 'pt'] as const;

interface FeedEntry {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
}

/**
 * Parse YouTube Atom RSS feed and extract all entries.
 * YouTube feeds use yt: and media: namespaces with stable structure.
 */
function parseFeedEntries(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([^<]+)<\/title>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    const thumbnailMatch = block.match(/<media:thumbnail\s[^>]*url="([^"]+)"/);

    if (videoIdMatch && titleMatch) {
      entries.push({
        videoId: videoIdMatch[1].trim(),
        title: decodeXmlEntities(titleMatch[1].trim()),
        thumbnailUrl: thumbnailMatch?.[1] ?? `https://img.youtube.com/vi/${videoIdMatch[1].trim()}/mqdefault.jpg`,
        publishedAt: publishedMatch?.[1] ?? new Date().toISOString(),
      });
    }
  }

  return entries;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * GET /api/cron/youtube-check
 *
 * Fetches YouTube playlist RSS feeds for each configured locale,
 * inserts new videos into youtube_videos with source='playlist'.
 * Called by Vercel Cron every 6 hours.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();
  const results: Record<string, { inserted: number; error?: string }> = {};
  let anyConfigured = false;

  for (const locale of PLAYLIST_LOCALES) {
    const playlistId = process.env[`YOUTUBE_PLAYLIST_${locale.toUpperCase()}`];
    if (!playlistId) continue;
    anyConfigured = true;

    try {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });

      if (!response.ok) {
        results[locale] = { inserted: 0, error: `HTTP ${response.status}` };
        continue;
      }

      const xml = await response.text();
      const entries = parseFeedEntries(xml);

      if (entries.length === 0) {
        results[locale] = { inserted: 0, error: 'no entries in feed' };
        continue;
      }

      const rows = entries.map((e) => ({
        youtube_id: e.videoId,
        title: e.title,
        thumbnail_url: e.thumbnailUrl,
        published_at: e.publishedAt,
        is_visible: false,
        source: 'playlist' as const,
        content_locale: locale,
        sort_order: 0,
      }));

      const { data, error } = await db
        .from('youtube_videos')
        .upsert(rows, { onConflict: 'youtube_id', ignoreDuplicates: true })
        .select('id');

      if (error) {
        results[locale] = { inserted: 0, error: error.message };
      } else {
        results[locale] = { inserted: data?.length ?? 0 };
      }
    } catch (err: any) {
      results[locale] = { inserted: 0, error: err.message ?? 'unknown error' };
    }
  }

  if (!anyConfigured) {
    return NextResponse.json({ ok: false, error: 'no playlists configured' });
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
}
