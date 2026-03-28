import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess, getUserMailboxIds } from '@/lib/email/auth';

// GET /api/email/threads — List conversations (filtered by mailbox access)
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const category = url.searchParams.get('category');
  const mailboxId = url.searchParams.get('mailbox_id');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  // Get accessible mailbox IDs
  const accessibleMailboxIds = await getUserMailboxIds(user.id, isAdmin);

  let query = supabase
    .from('conversations')
    .select('*, mailboxes(name, address)', { count: 'exact' })
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by accessible mailboxes (admin sees all, staff sees only their mailboxes)
  if (!isAdmin && accessibleMailboxIds.length > 0) {
    query = query.in('mailbox_id', accessibleMailboxIds);
  }

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (category) query = query.eq('ai_category', category);
  if (mailboxId) {
    // Extra check: user must have access to this specific mailbox
    if (!isAdmin && !accessibleMailboxIds.includes(mailboxId)) {
      return NextResponse.json({ threads: [], total: 0, page, limit });
    }
    query = query.eq('mailbox_id', mailboxId);
  }
  if (search) {
    query = query.or(`subject.ilike.%${search}%,from_address.ilike.%${search}%,from_name.ilike.%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also return mailbox list for filter UI
  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('id, name, address')
    .in('id', accessibleMailboxIds)
    .eq('is_active', true);

  return NextResponse.json({
    threads: data || [],
    total: count || 0,
    page,
    limit,
    mailboxes: mailboxes || [],
  });
}
