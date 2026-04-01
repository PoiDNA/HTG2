import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { validateSubject, validateBodyText } from '@/lib/portal/validation';

const PORTAL_ADDRESS = 'portal@htg.internal';
const MAX_CONVERSATIONS_24H = 5;
const PAGE_LIMIT = 20;

// GET /api/portal/conversations — list user's portal conversations (pure read)
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();
  const url = new URL(req.url);

  // Cursor-based pagination: (last_message_at, id)
  const cursorTime = url.searchParams.get('cursor_time');
  const cursorId = url.searchParams.get('cursor_id');

  let query = db
    .from('conversations')
    .select('*', { count: 'exact' })
    .eq('channel', 'portal')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_LIMIT);

  if (cursorTime && cursorId) {
    query = query.or(`last_message_at.lt.${cursorTime},and(last_message_at.eq.${cursorTime},id.lt.${cursorId})`);
  }

  const { data: conversations, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with last snippet and unread count per conversation
  const enriched = await Promise.all(
    (conversations || []).map(async (conv: any) => {
      const { data: lastMsg } = await db
        .from('messages')
        .select('body_text')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unreadCount } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('direction', 'outbound')
        .is('read_at', null);

      return {
        ...conv,
        last_snippet: lastMsg?.body_text?.slice(0, 80) || null,
        unread_count: unreadCount || 0,
      };
    })
  );

  return NextResponse.json({
    conversations: enriched,
    total: count || 0,
  });
}

// POST /api/portal/conversations — create new portal conversation
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const subject = validateSubject(body.subject);
  const bodyText = validateBodyText(body.body_text);

  if (!subject) {
    return NextResponse.json({ error: 'Temat jest wymagany (1-100 znaków)' }, { status: 400 });
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'Treść wiadomości jest wymagana (1-2000 znaków)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Rate limit: 5 conversations per 24h per user
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('channel', 'portal')
    .gte('created_at', since24h);

  if ((recentCount || 0) >= MAX_CONVERSATIONS_24H) {
    console.info('Portal rate limit hit', { userId: user.id, count: recentCount });
    return NextResponse.json(
      { error: 'Przekroczono limit wiadomości. Spróbuj ponownie za 24h.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  // Lookup portal mailbox
  const { data: mailbox } = await db
    .from('mailboxes')
    .select('id')
    .eq('address', PORTAL_ADDRESS)
    .single();

  if (!mailbox) {
    console.error('Portal mailbox not found');
    return NextResponse.json({ error: 'Konfiguracja systemu nie jest gotowa' }, { status: 500 });
  }

  // Atomic create via RPC
  const { data: result, error } = await db.rpc('create_portal_conversation', {
    p_user_id: user.id,
    p_user_email: user.email || '',
    p_subject: subject,
    p_body_text: bodyText,
    p_mailbox_id: mailbox.id,
  });

  if (error) {
    console.error('Portal RPC failed', { userId: user.id, error: error.message });
    return NextResponse.json({ error: 'Nie udało się utworzyć wiadomości' }, { status: 500 });
  }

  const row = Array.isArray(result) ? result[0] : result;
  console.info('Portal conversation created', { userId: user.id, conversationId: row?.conversation_id });

  return NextResponse.json({ conversationId: row?.conversation_id });
}
