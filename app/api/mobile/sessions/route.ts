import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireBearer } from '../_lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const locale = url.searchParams.get('locale') ?? 'pl';
  const cursor = url.searchParams.get('cursor');

  const admin = createSupabaseServiceRole();
  let query = admin
    .from('sessions')
    .select(
      'id, slug, title, description, cover_url, duration_sec, kind, status, starts_at, published_at, required_tier, locale',
    )
    .eq('locale', locale)
    .in('status', ['published', 'live', 'scheduled'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(DEFAULT_PAGE_SIZE + 1);

  if (cursor) {
    query = query.lt('published_at', cursor);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = data.length > DEFAULT_PAGE_SIZE;
  const page = hasMore ? data.slice(0, DEFAULT_PAGE_SIZE) : data;

  const { data: subs } = await admin
    .from('stripe_subscriptions')
    .select('status')
    .eq('user_id', auth.user.id)
    .in('status', ['active', 'trialing']);
  const userIsEntitled = (subs?.length ?? 0) > 0;

  const items = page.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    coverUrl: s.cover_url,
    durationSec: s.duration_sec,
    kind: s.kind,
    status: s.status,
    startsAt: s.starts_at,
    publishedAt: s.published_at,
    isEntitled:
      !s.required_tier || s.required_tier === 'free' ? true : userIsEntitled,
    locale: s.locale,
  }));

  const nextCursor = hasMore
    ? (page[page.length - 1]?.published_at ?? null)
    : null;

  return NextResponse.json({ items, nextCursor });
}
