import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireBearer } from '../../../_lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireBearer(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const admin = createSupabaseServiceRole();

  const { data, error } = await admin
    .from('moments')
    .select(
      'id, session_id, title, category, start_sec, end_sec, transcript_excerpt, speaker_name, published_at',
    )
    .eq('session_id', id)
    .not('published_at', 'is', null)
    .order('start_sec', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data.map((m) => ({
    id: m.id,
    sessionId: m.session_id,
    title: m.title,
    category: m.category,
    startSec: m.start_sec,
    endSec: m.end_sec,
    transcriptExcerpt: m.transcript_excerpt,
    speakerName: m.speaker_name,
    publishedAt: m.published_at,
  }));

  return NextResponse.json({ items });
}
