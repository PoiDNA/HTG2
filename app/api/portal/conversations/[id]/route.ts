import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { validateUUID } from '@/lib/portal/validation';

const MAX_MESSAGES = 200;

// GET /api/portal/conversations/[id] — conversation detail (pure read, no side effects)
export async function GET(
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

  // Ownership check: user_id must match AND channel must be portal
  const { data: conversation } = await db
    .from('conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('channel', 'portal')
    .single();

  if (!conversation) {
    // 403 not 404 — don't reveal existence of other conversations
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch messages with safety valve limit
  const { data: messages } = await db
    .from('messages')
    .select('id, direction, from_address, to_address, body_text, read_at, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES);

  return NextResponse.json({
    conversation,
    messages: messages || [],
  });
}
