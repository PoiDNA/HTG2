import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { validateUUID } from '@/lib/portal/validation';

// POST /api/portal/conversations/[id]/read — mark outbound messages as read
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!validateUUID(id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceRole();

  // Ownership check
  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('channel', 'portal')
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Mark all unread outbound messages as read
  await db
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .eq('direction', 'outbound')
    .is('read_at', null);

  return NextResponse.json({ marked: true });
}
