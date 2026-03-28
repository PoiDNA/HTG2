import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

// POST /api/htg-meeting/session/[id]/done
// Body: { userId?: string }  — moderator can force-done for another user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = createSupabaseServiceRole();

  // Determine which user to mark done
  let targetUserId = user.id;

  if (body.userId && body.userId !== user.id) {
    // Moderator forcing done for someone else
    const isAdmin = isAdminEmail(user.email ?? '');
    const { data: session } = await db
      .from('htg_meeting_sessions')
      .select('moderator_id')
      .eq('id', sessionId)
      .single();

    if (!isAdmin && session?.moderator_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = body.userId;
  }

  await db
    .from('htg_meeting_queue')
    .update({ is_done: true, done_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', targetUserId)
    .eq('is_done', false);

  return NextResponse.json({ ok: true });
}
