import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireBearer } from '../../_lib/auth';
import { isSessionEntitled } from '../../_lib/entitlement';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const admin = createSupabaseServiceRole();

  const { data: session, error } = await admin
    .from('sessions')
    .select(
      `id, slug, title, description, long_description, cover_url,
       duration_sec, kind, status, starts_at, published_at,
       required_tier, locale, live_room_id,
       speakers:session_speakers(
         speaker:speakers(id, name, avatar_url, role)
       )`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [{ data: progress }, { count: momentCount }] = await Promise.all([
    admin
      .from('session_progress')
      .select('position_sec')
      .eq('user_id', auth.user.id)
      .eq('session_id', id)
      .maybeSingle(),
    admin
      .from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id),
  ]);

  const isEntitled = await isSessionEntitled(admin, auth.user.id, id);

  type SpeakerRow = { id: string; name: string; avatar_url: string | null; role: string | null };
  type SpeakerJoin = { speaker: SpeakerRow | SpeakerRow[] | null };
  const speakers = ((session.speakers ?? []) as unknown as SpeakerJoin[])
    .flatMap((row) =>
      Array.isArray(row.speaker)
        ? row.speaker
        : row.speaker
          ? [row.speaker]
          : [],
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      avatarUrl: s.avatar_url,
      role: s.role,
    }));

  return NextResponse.json({
    id: session.id,
    slug: session.slug,
    title: session.title,
    description: session.description,
    longDescription: session.long_description,
    coverUrl: session.cover_url,
    durationSec: session.duration_sec,
    kind: session.kind,
    status: session.status,
    startsAt: session.starts_at,
    publishedAt: session.published_at,
    isEntitled,
    locale: session.locale,
    liveRoomId: session.live_room_id,
    lastPositionSec: progress?.position_sec ?? null,
    momentCount: momentCount ?? 0,
    speakers,
  });
}
