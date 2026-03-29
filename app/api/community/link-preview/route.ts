import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';

/**
 * GET /api/community/link-preview?url=https://example.com
 *
 * Fetch Open Graph metadata for a URL.
 * Used by TipTap editor for link unfurling / previews.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Block internal/private URLs
  const hostname = parsedUrl.hostname;
  if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return NextResponse.json({ error: 'Internal URLs not allowed' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HTG-LinkPreview/1.0 (bot)',
        'Accept': 'text/html',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'Not an HTML page' }, { status: 400 });
    }

    // Limit response size to 100KB
    const text = await res.text();
    const html = text.slice(0, 100_000);

    // Parse OG tags with regex (lightweight, no dependency needed)
    const metadata = extractOpenGraph(html, url);

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=86400', // Cache for 24h
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// ─── OG Tag Parser (no dependencies) ─────────────────────────

interface OGMetadata {
  title: string | null;
  description: string | null;
  og_image: string | null;
  site_name: string | null;
  favicon: string | null;
}

function extractOpenGraph(html: string, baseUrl: string): OGMetadata {
  const getMetaContent = (property: string): string | null => {
    // Match both property="..." and name="..."
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHTMLEntities(match[1]);
    }
    return null;
  };

  // Get title: og:title > <title> tag
  const ogTitle = getMetaContent('og:title');
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = ogTitle || (titleMatch?.[1] ? decodeHTMLEntities(titleMatch[1].trim()) : null);

  // Get description: og:description > meta description
  const description = getMetaContent('og:description') || getMetaContent('description');

  // Get image: og:image
  let ogImage = getMetaContent('og:image');
  if (ogImage && !ogImage.startsWith('http')) {
    try {
      ogImage = new URL(ogImage, baseUrl).href;
    } catch { /* ignore */ }
  }

  // Get site name
  const siteName = getMetaContent('og:site_name');

  // Get favicon
  const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i);
  let favicon = faviconMatch?.[1] || null;
  if (favicon && !favicon.startsWith('http')) {
    try {
      favicon = new URL(favicon, baseUrl).href;
    } catch { /* ignore */ }
  }

  return { title, description, og_image: ogImage, site_name: siteName, favicon };
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
