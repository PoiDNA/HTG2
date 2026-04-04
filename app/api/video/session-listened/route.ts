import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/video/session-listened
 * Toggle "listened" mark for a VOD session.
 *
 * Body: { sessionId: string, listened: boolean }
 * - listened=true  → upsert row
 * - listened=false → delete row
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId, listened } = await request.json();
    if (!sessionId || typeof listened !== 'boolean') {
      return NextResponse.json({ error: 'sessionId and listened required' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    if (listened) {
      await db.from('session_listens').upsert(
        { user_id: user.id, session_id: sessionId },
        { onConflict: 'user_id,session_id' },
      );
    } else {
      await db.from('session_listens')
        .delete()
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[session-listened]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
