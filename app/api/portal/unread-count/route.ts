import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// GET /api/portal/unread-count — count conversations with unread admin replies
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  // Count distinct conversations with unread outbound messages
  // Uses partial index idx_msg_portal_unread
  const { data, error } = await db.rpc('count_portal_unread', { p_user_id: user.id });

  // Fallback if RPC doesn't exist yet: manual query
  if (error) {
    const { data: convIds } = await db
      .from('messages')
      .select('conversation_id')
      .eq('channel', 'portal')
      .eq('direction', 'outbound')
      .is('read_at', null);

    if (!convIds || convIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Filter to user's conversations
    const uniqueConvIds = [...new Set(convIds.map((m: any) => m.conversation_id))];
    const { count } = await db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('channel', 'portal')
      .in('id', uniqueConvIds);

    return NextResponse.json({ count: count || 0 });
  }

  return NextResponse.json({ count: data || 0 });
}
