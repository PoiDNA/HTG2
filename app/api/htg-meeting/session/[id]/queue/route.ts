import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// POST /api/htg-meeting/session/[id]/queue
// Body: { action: 'join' | 'leave' }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json();
  const db = createSupabaseServiceRole();

  // Get participant display name
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name || profile?.email || 'Uczestnik';

  if (action === 'join') {
    // Add to queue (upsert — if already done, re-add)
    await db.from('htg_meeting_queue').upsert({
      session_id: sessionId,
      user_id: user.id,
      display_name: displayName,
      queued_at: new Date().toISOString(),
      is_done: false,
      done_at: null,
    }, { onConflict: 'session_id,user_id' });

    return NextResponse.json({ ok: true });
  }

  if (action === 'leave') {
    await db
      .from('htg_meeting_queue')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
