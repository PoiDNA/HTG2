import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/video/session-bookmark
 * Toggle "wróć" bookmark for a VOD session.
 *
 * Body: { sessionId: string, bookmarked: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId, bookmarked } = await request.json();
    if (!sessionId || typeof bookmarked !== 'boolean') {
      return NextResponse.json({ error: 'sessionId and bookmarked required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    if (bookmarked) {
      await db.from('session_bookmarks').upsert(
        { user_id: user.id, session_id: sessionId },
        { onConflict: 'user_id,session_id' },
      );
    } else {
      await db.from('session_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[session-bookmark]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
